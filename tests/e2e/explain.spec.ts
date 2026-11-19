import { expect, test, type Page } from '@playwright/test';

// The test server runs WITHOUT any AI key (Anthropic or Gemini): everything here is the no-key path.

async function settings(page: Page, opts: { demo?: boolean; pregnant?: boolean; allergies?: string } = {}) {
  await page.goto('/en/settings');
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
  if (opts.demo) await page.getByTestId('demo-mode').check();
  if (opts.pregnant !== undefined || opts.allergies !== undefined) {
    if (opts.allergies !== undefined) await page.getByTestId('profile-allergies').fill(opts.allergies);
    if (opts.pregnant) await page.getByTestId('profile-pregnant').check();
    await page.getByTestId('profile-save').click();
    await expect(page.getByTestId('profile-form').getByRole('status')).toBeVisible();
  }
}

async function addMedicine(page: Page, name: string) {
  await page.getByTestId('add-line').click();
  const line = page.locator('[data-testid="rx-line"][data-confirmed="false"]').last();
  await line.getByTestId('line-medicine').fill(name);
  await line.getByTestId('confirm-line').click({ timeout: 15_000 }); // enabled once the database lookup finished
}

async function confirmAll(page: Page) {
  const open = page.locator('[data-testid="rx-line"][data-confirmed="false"]');
  while ((await open.count()) > 0) await open.first().getByTestId('confirm-line').click({ timeout: 15_000 });
}

test.describe('API without a key', () => {
  test('handwriting is "not available"', async ({ request }) => {
    expect(await (await request.get('/api/handwriting')).json()).toEqual({ available: false, provider: null });
    const res = await request.post('/api/handwriting', { data: { image: 'aGVsbG8=', mediaType: 'image/jpeg' } });
    expect(res.status()).toBe(503);
    expect(await res.json()).toEqual({ error: 'not_available' });
  });

  test('explain returns the template in the requested language', async ({ request }) => {
    const data = {
      locale: 'bn',
      values: [{ test: 'FBS', value: 7.8, unit: 'mmol/L', status: 'high', range: '3.9 - 5.6', rangeSource: 'printed' }],
      medicines: [],
      findings: [],
      relations: [],
    };
    const body = await (await request.post('/api/explain', { data })).json();
    expect(body).toMatchObject({ source: 'template', reason: 'not_available' });
    expect(body.text).toContain('ছাপানো সীমার');
  });
});

test('without a key the page says so, and medicines can be typed and checked', async ({ page }) => {
  await page.goto('/en/medicine');
  await expect(page.getByTestId('ai-off')).toContainText('not set up');
  await expect(page.getByTestId('explain-check')).toBeDisabled();

  await addMedicine(page, 'Napa');
  await addMedicine(page, 'Ace');
  await expect(page.locator('[data-testid="rx-line"][data-confirmed="true"]')).toHaveCount(2);
  await page.getByTestId('explain-check').click();

  await expect(page.locator('[data-finding="duplicateIngredient"]')).toContainText('Napa, Ace all contain paracetamol');
  await expect(page.getByTestId('results-explanation')).toHaveAttribute('data-source', 'template');
  await expect(page.getByTestId('explanation-source')).toHaveText('Standard explanation (AI was not used).');
});

test('rule 7: nothing is checked until every line is confirmed', async ({ page }) => {
  await settings(page, { demo: true });
  await page.goto('/en/medicine');
  await page.getByTestId('sample-prescription').click();
  await expect(page.getByTestId('rx-notice-demoLines')).toBeVisible();
  await expect(page.getByTestId('rx-line')).toHaveCount(6);
  await expect(page.getByTestId('must-confirm')).toContainText('6 more lines');
  await expect(page.getByTestId('explain-check')).toBeDisabled();
  await page.locator('[data-testid="rx-line"]').first().getByTestId('confirm-line').click({ timeout: 15_000 });
  await expect(page.getByTestId('must-confirm')).toContainText('5 more lines');
  await expect(page.getByTestId('explain-check')).toBeDisabled();
});

test('demo: report + prescription → findings, relations and template explanation', async ({ page }) => {
  test.slow(); // on-device OCR is CPU-heavy when tests run in parallel
  await settings(page, { demo: true, pregnant: true });
  await page.goto('/en/medicine');

  // Printed report, read on the phone.
  await page.getByTestId('sample-report').click();
  const values = page.getByTestId('report-values');
  await expect(values.locator('li')).toHaveCount(6, { timeout: 60_000 });
  await expect(values.locator('li[data-status="high"]')).toHaveCount(3); // FBS, HbA1c, cholesterol
  await expect(values.locator('li[data-status="low"]')).toHaveCount(1); // haemoglobin
  await expect(values).toContainText('please check it against the report'); // a repaired OCR range is shown for checking

  // Prescription: sample lines (no key), each confirmed and matched to the database.
  await page.getByTestId('sample-prescription').click();
  await expect(page.getByTestId('rx-diagnosis')).toHaveValue('Type 2 DM, Dyslipidaemia');
  await confirmAll(page);
  await expect(page.locator('[data-testid="rx-line"][data-confirmed="true"]')).toHaveCount(6);
  await expect(page.getByTestId('rx-step')).toContainText('Metformin Hydrochloride');

  await page.getByTestId('explain-check').click();
  await expect(page.getByTestId('results-diagnosis')).toContainText('Type 2 DM, Dyslipidaemia');
  const findings = page.getByTestId('results-findings');
  await expect(findings.locator('[data-finding="duplicateIngredient"]')).toContainText('paracetamol');
  await expect(findings.locator('[data-finding="interaction"]')).toContainText('Clopid and Seclo');
  await expect(findings.locator('[data-finding="pregnancy"]')).toContainText('Rosuva');
  await expect(page.locator('[data-relation="related"]').first()).toContainText('Comet is commonly used when Fasting Blood Sugar');
  await expect(page.locator('[data-relation="noLinkedMedicine"]')).toContainText('Ask your doctor; do not stop on your own.');
  await expect(page.getByTestId('results-explanation')).toHaveAttribute('data-source', 'template');
  await expect(page.getByTestId('explanation-text')).toContainText('Your doctor wrote this diagnosis');
  await expect(page.getByTestId('explain-results')).not.toContainText(/you have diabetes|stop taking|reduce the dose/i);
});

test('the crop preview is shown before anything could be sent (when reading is available)', async ({ page }) => {
  // Pretend handwriting reading is available so the crop step appears; POST is not called in this test.
  await page.route('**/api/handwriting', (route) =>
    route.request().method() === 'GET' ? route.fulfill({ json: { available: true } }) : route.abort(),
  );
  await settings(page, { demo: true });
  await page.goto('/en/medicine');
  await expect(page.getByTestId('ai-on')).toBeVisible();
  await page.getByTestId('sample-prescription').click();
  await expect(page.getByTestId('rx-crop')).toContainText('Part to cut off from the top: 25%');
  const preview = page.getByTestId('rx-preview');
  await expect(preview).toBeVisible();
  // The preview is the photo minus its top 25% (1400 px tall sample → 1050 px; or 2800 → 2100 at 2× scale)
  const ratio = await preview.evaluate((img: HTMLImageElement) => img.naturalHeight / img.naturalWidth);
  expect(ratio).toBeCloseTo((1400 * 0.75) / 1100, 1);
});

test('Bangla: the no-key notice is in Bangla', async ({ page }) => {
  await page.goto('/bn/medicine');
  await expect(page.getByTestId('ai-off')).toContainText('হাতের লেখা পড়ার সুবিধা চালু হয়নি');
});
