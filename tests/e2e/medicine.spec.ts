import { expect, test, type Page } from '@playwright/test';
import { setDemoMode } from './helpers';

// Needs data/build/medicines.sqlite (npm run build:data) and a production build.

const enableDemoMode = setDemoMode;

async function scanSample(page: Page, sample: 'demoOk' | 'demoCheck', locale = 'en') {
  await enableDemoMode(page);
  await page.goto(`/${locale}/medicine`);
  await page.getByTestId(`sample-${sample}`).click();
  await expect(page.getByTestId('confirm-step')).toBeVisible({ timeout: 60_000 });
}

test.describe('API', () => {
  test('fuzzy brand search tolerates OCR misreads', async ({ request }) => {
    const res = await request.get('/api/medicines/search?q=Secl0');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.results[0].brand).toBe('Seclo');
    expect(body.data.lastUpdated).toBe('2021-09');
  });

  test('alternatives share generic, strength and form, sorted by unit price', async ({ request }) => {
    const search = await (await request.get('/api/medicines/search?q=napa')).json();
    const napa = search.results[0].products.find((p: { form: string; strength: string }) => p.form === 'Tablet' && p.strength === '500mg');
    const body = await (await request.get(`/api/medicines/alternatives?id=${napa.id}`)).json();
    expect(body.status).toBe('ok');
    const alts = body.alternatives as Array<{ generic: string; strength: string; form: string; unitPrice: number }>;
    expect(alts.length).toBeGreaterThan(3);
    for (const a of alts) expect([a.generic, a.strength.replace(/\s/g, ''), a.form]).toEqual(['Paracetamol', '500mg', 'Tablet']);
    expect(alts.map((a) => a.unitPrice)).toEqual([...alts.map((a) => a.unitPrice)].sort((x, y) => x - y));
  });

  test('bad input is rejected', async ({ request }) => {
    expect((await request.get('/api/medicines/search?q=a')).status()).toBe(400);
    expect((await request.get('/api/medicines/alternatives?id=abc')).status()).toBe(400);
    expect((await request.get('/api/medicines/alternatives?id=99999999')).status()).toBe(404);
  });
});

test('scan a normal pack: OCR → confirm brand → no suspicious signs, cheaper brands', async ({ page }) => {
  test.slow(); // on-device OCR is CPU-heavy when tests run in parallel
  await scanSample(page, 'demoOk');
  await expect(page.getByTestId('read-as')).toContainText('Napa');
  // The user must confirm; the brand, strength and form read on the pack are pre-selected.
  await expect(page.locator('input[type=radio]:checked').locator('xpath=..')).toContainText('Napa 500mg · Tablet');
  await page.getByTestId('confirm-product').click();

  await expect(page.getByTestId('result-generic')).toHaveText('Paracetamol');
  await expect(page.getByTestId('result-indication')).toContainText('pain and fever');
  await expect(page.getByTestId('result-expiry')).toHaveAttribute('data-status', 'ok');
  await expect(page.getByTestId('result-signs')).toContainText('No suspicious signs found');
  await expect(page.getByTestId('result-read')).toContainText('2405123');
  await expect(page.getByTestId('alternative').first()).toBeVisible();
  await expect(page.getByTestId('pharmacist-note')).toHaveText('Confirm with your pharmacist.');
  await expect(page.getByTestId('prices-note')).toContainText('September 2021');
});

test('scan a pack with problems: lists each suspicious sign, never a verdict', async ({ page }) => {
  test.slow(); // on-device OCR is CPU-heavy when tests run in parallel
  await scanSample(page, 'demoCheck');
  await page.getByTestId('confirm-product').click();
  const signs = page.getByTestId('result-signs');
  await expect(signs).toContainText('5 suspicious signs found:');
  for (const code of ['manufacturerSpelling', 'missingBatch', 'expiryBeforeManufacture', 'expired', 'priceFarBelow']) {
    await expect(signs.locator(`[data-sign="${code}"]`)).toBeVisible();
  }
  await expect(page.getByTestId('result-expiry')).toHaveAttribute('data-status', 'expired');
  await expect(page.getByTestId('pack-results')).not.toContainText(/fake|genuine|counterfeit/i);
});

test('typed brand search works without a photo (Bangla)', async ({ page }) => {
  await page.goto('/bn/medicine');
  await page.getByTestId('brand-search').fill('seclo');
  await page.getByRole('button', { name: 'খুঁজুন' }).first().click();
  await expect(page.getByTestId('confirm-step')).toBeVisible();
  await page.locator('label', { hasText: 'Seclo 20mg · Capsule' }).first().click();
  await page.getByTestId('confirm-product').click();
  await expect(page.getByTestId('result-generic')).toHaveText('Omeprazole');
  await expect(page.getByTestId('pharmacist-note')).toHaveText('ফার্মাসিস্টের সঙ্গে নিশ্চিত হয়ে নিন।');
  await expect(page.getByTestId('result-signs')).toHaveCount(0); // nothing was read from a pack
});

test('a poor photo gets a quality warning before OCR', async ({ page }) => {
  await page.goto('/en/medicine');
  await page.getByTestId('scan-pack').getByTestId('gallery-input').setInputFiles('public/icons/icon-192.png');
  await expect(page.getByTestId('quality-issues')).toContainText('too small');
  await page.getByRole('button', { name: 'Retake photo' }).click();
  await expect(page.getByTestId('scan-pack')).toHaveAttribute('data-step', 'idle');
});
