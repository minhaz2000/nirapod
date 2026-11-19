/**
 * Prescription reading without any AI key: medicine-name autocomplete (brand and generic, Bangla-friendly) and
 * on-phone OCR matched to the closest medicine names, always as suggestions the user confirms (rule 7).
 * Plus the consent note shown before a photo is sent when an AI provider IS available (simulated).
 */
import { expect, test, type Page } from '@playwright/test';
import { setDemoMode } from './helpers';

test.use({ serviceWorkers: 'block' }); // lets page.route see API calls

function track(page: Page) {
  const sent: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().includes('/api/handwriting')) sent.push(r.url());
  });
  return sent;
}

test.describe('API without a key', () => {
  test('suggest: brand and generic names, Latin or Bangla; match: closest names for OCR words', async ({ request }) => {
    const metf = await (await request.get('/api/medicines/suggest?q=metf')).json();
    expect(metf.suggestions).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Metformin Hydrochloride', kind: 'generic' })]));
    const bangla = await (await request.get(`/api/medicines/suggest?q=${encodeURIComponent('নাপা')}`)).json();
    expect(bangla.suggestions[0]).toMatchObject({ name: 'Napa', kind: 'brand', generic: 'Paracetamol' });
    expect((await request.get('/api/medicines/suggest?q=m')).status()).toBe(400);

    const match = await (await request.post('/api/medicines/match', { data: { names: ['Metfrmin', 'Secl0', 'Rahima'] } })).json();
    expect(match.matches[0]).toMatchObject({ name: expect.stringMatching(/^Metformin/), exact: false });
    expect(match.matches[1]).toMatchObject({ name: 'Seclo', generic: 'Omeprazole' });
    expect(match.matches[2]).toBeNull();
    expect((await request.post('/api/medicines/match', { data: { names: 'Napa' } })).status()).toBe(400);
  });
});

test('autocomplete after 2 letters: pick a generic by name, then confirm (no AI key)', async ({ page }) => {
  await page.goto('/en/medicine');
  await expect(page.getByTestId('ai-off')).toBeVisible();
  await page.getByTestId('add-line').click();
  const line = page.locator('[data-testid="rx-line"][data-confirmed="false"]').last();
  await line.getByTestId('line-medicine').fill('metf');
  const options = line.getByTestId('rx-autocomplete-option');
  const generic = line.locator('[data-testid="rx-autocomplete-option"][data-kind="generic"]').filter({ hasText: 'Metformin Hydrochloride' });
  await expect(generic.first()).toBeVisible({ timeout: 15_000 });
  await expect(line.locator('[data-testid="rx-autocomplete-option"][data-kind="brand"]').first()).toBeVisible(); // brands too
  const box = (await options.first().boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  await generic.first().click();
  await expect(line.getByTestId('line-medicine')).toHaveValue('Metformin Hydrochloride');
  await expect(line.getByTestId('rx-autocomplete')).toHaveCount(0);
  await expect(line).toContainText('generic name (no brand chosen)', { timeout: 15_000 });
  await line.getByTestId('confirm-line').click({ timeout: 15_000 });
  await expect(page.locator('[data-testid="rx-line"][data-confirmed="true"]')).toContainText('Metformin Hydrochloride');
});

test('Bangla: a brand typed in Bangla is suggested in Latin letters', async ({ page }) => {
  await page.goto('/bn/medicine');
  await page.getByTestId('add-line').click();
  const line = page.locator('[data-testid="rx-line"]').last();
  await line.getByTestId('line-medicine').fill('নাপা');
  await expect(line.getByTestId('rx-autocomplete')).toContainText('ওষুধের তালিকা থেকে পরামর্শ', { timeout: 15_000 });
  await expect(line.getByTestId('rx-autocomplete-option').first()).toContainText('Napa');
  await expect(line.getByTestId('rx-autocomplete-option').first()).toContainText('ব্র্যান্ড');
});

test('no key: photo → names found on the phone → suggestions added for the user to confirm; nothing sent to AI', async ({ page }) => {
  test.slow(); // on-device OCR
  const sent = track(page);
  await page.goto('/en/medicine');
  await expect(page.getByTestId('ai-off')).toBeVisible();
  const rx = page.getByTestId('rx-step');
  await rx.getByTestId('gallery-input').setInputFiles('public/samples/prescription.png');
  await expect(rx.getByTestId('rx-notice-notAvailable')).toBeVisible();
  await expect(rx.getByTestId('rx-crop')).toBeVisible();
  await expect(rx.getByTestId('rx-send')).toHaveCount(0); // no AI: nothing to send, no consent needed
  await expect(rx.getByTestId('rx-preview')).toBeVisible();
  await rx.getByTestId('rx-ocr').click();

  const items = rx.getByTestId('rx-ocr-item');
  await expect(rx.getByTestId('rx-ocr-suggestions')).toBeVisible({ timeout: 90_000 });
  const matched = await items.evaluateAll((els) => els.map((e) => e.getAttribute('data-match')));
  expect(matched).toEqual(expect.arrayContaining(['Comet', 'Rosuva', 'Clopid', 'Seclo', 'Napa']));
  await expect(rx.getByTestId('rx-ocr-suggestions')).toContainText('Suggestions only. Confirm or edit every line');
  await expect(rx.getByTestId('rx-ocr-suggestions')).not.toContainText(/Rahima|01712/); // header was cropped

  await rx.getByTestId('rx-ocr-add-all').click();
  const lines = page.getByTestId('rx-line');
  await expect(lines).toHaveCount(matched.length);
  await expect(page.locator('[data-testid="rx-line"][data-confirmed="true"]')).toHaveCount(0); // rule 7
  await expect(page.getByTestId('must-confirm')).toBeVisible();
  const comet = lines.filter({ has: page.locator('[data-testid="line-medicine"][value="Comet"]') });
  await expect(comet.getByTestId('line-strength')).toHaveValue('500 mg');
  await expect(comet.getByTestId('line-frequency')).toHaveValue('1+0+1');
  await expect(comet.getByTestId('line-duration')).toHaveValue('30 days');
  expect(sent).toEqual([]);
});

test('with an AI provider (simulated): consent note first; "Type instead" sends nothing, "Continue" sends the cropped photo', async ({ page }) => {
  let posts = 0;
  await page.route('**/api/handwriting', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { available: true, provider: 'gemini' } });
    posts++;
    const body = route.request().postDataJSON() as { image: string; mediaType: string };
    expect(body.mediaType).toBe('image/jpeg');
    return route.fulfill({ json: { status: 'ok', items: [{ medicine: 'Comet', strength: '500 mg', frequency: '1+0+1', duration: '30 days', diagnosis_if_written: '', confidence: 0.9 }] } });
  });
  await setDemoMode(page);
  await page.goto('/en/medicine');
  await expect(page.getByTestId('ai-on')).toContainText('Google Gemini');
  await page.getByTestId('sample-prescription').click();
  const rx = page.getByTestId('rx-step');
  await expect(rx.getByTestId('rx-preview')).toBeVisible();

  await rx.getByTestId('rx-send').click();
  const consent = rx.getByTestId('rx-consent');
  await expect(consent).toContainText('The photo will be sent to an AI service to read the handwriting. Names and phone numbers are removed first.');
  await consent.getByTestId('rx-consent-type').click();
  await expect(rx.getByTestId('rx-notice-typeInstead')).toBeVisible();
  expect(posts).toBe(0);

  await rx.getByTestId('rx-send').click();
  await rx.getByTestId('rx-consent-continue').click();
  await expect(rx.getByTestId('rx-notice-readByAi')).toBeVisible();
  expect(posts).toBe(1);
  await expect(page.locator('[data-testid="rx-line"][data-confirmed="false"]')).toHaveCount(1); // rule 7
});

test('Bangla consent note and About page provider line', async ({ page }) => {
  await page.route('**/api/handwriting', (route) =>
    route.request().method() === 'GET' ? route.fulfill({ json: { available: true, provider: 'anthropic' } }) : route.abort(),
  );
  await setDemoMode(page);
  await page.goto('/bn/medicine');
  await page.getByTestId('sample-prescription').click();
  await page.getByTestId('rx-send').click();
  await expect(page.getByTestId('rx-consent')).toContainText('নাম ও ফোন নম্বর সরিয়ে ফেলা হয়');
  await expect(page.getByTestId('rx-consent-continue')).toHaveText('চালিয়ে যান');
  await expect(page.getByTestId('rx-consent-type')).toHaveText('নিজে লিখুন');

  await page.goto('/en/about');
  await expect(page.getByTestId('about-llm-current')).toHaveText('This copy uses: Anthropic Claude.');
});

test('About page without a key says no AI service is set up (both languages)', async ({ page }) => {
  await page.goto('/en/about');
  await expect(page.getByTestId('about-llm')).toContainText('Anthropic Claude or Google Gemini');
  await expect(page.getByTestId('about-llm-current')).toContainText('no AI service set up');
  await page.goto('/bn/about');
  await expect(page.getByTestId('about-llm-current')).toContainText('কোনো এআই সেবা সেট করা নেই');
});
