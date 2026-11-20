/**
 * Medicine pack → which medicine + when it expires.
 * - No key: on-phone OCR of the No Pain pack (regression: used to be identified as another medicine).
 * - Vision model (Gemini, mocked): consent first, then the answer is verified against the medicine database.
 */
import { existsSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' }); // lets page.route see API calls

const FRONT = 'tests/fixtures/packs/no-pain-front.jpg';
const BACK = 'tests/fixtures/packs/no-pain-back.jpg';
/** The user's own photo of the failing pack, when it is added to the repository. */
const REAL_PHOTO = 'tests/fixtures/packs/no-pain-photo.jpg';

type Fields = Partial<Record<'brand' | 'generic' | 'strength' | 'dosage_form' | 'manufacturer' | 'expiry_date' | 'manufacturing_date' | 'batch_number' | 'dar_number' | 'visible_text', string>>;
const EMPTY = { brand: '', generic: '', strength: '', dosage_form: '', manufacturer: '', expiry_date: '', manufacturing_date: '', batch_number: '', dar_number: '', visible_text: '' };

/** Simulates a configured Gemini provider; `answers` are returned in order (the last one repeats). */
async function mockGemini(page: Page, answers: Array<Fields | 'error'>) {
  const posts: unknown[] = [];
  await page.route('**/api/pack/read', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { available: true, provider: 'gemini' } });
    posts.push(route.request().postDataJSON());
    const a = answers[Math.min(posts.length - 1, answers.length - 1)]!;
    return a === 'error' ? route.fulfill({ status: 502, json: { error: 'failed', reason: 'invalid_model' } }) : route.fulfill({ json: { status: 'ok', fields: { ...EMPTY, ...a } } });
  });
  return posts;
}

/** Opens the medicine page and waits until it knows whether AI reading is available (the scan screen asks once). */
async function openMedicine(page: Page, locale: 'en' | 'bn' = 'en') {
  const known = page.waitForResponse((r) => r.url().includes('/api/pack/read') && r.request().method() === 'GET');
  await page.goto(`/${locale}/medicine`);
  await known;
}

async function upload(page: Page, file: string, where = page.getByTestId('scan-pack')) {
  await where.getByTestId('gallery-input').first().setInputFiles(file);
}

/** Waits for a final step; continues past the photo-quality warning if it appears. */
async function settle(page: Page) {
  const sp = page.getByTestId('scan-pack');
  await expect(sp).toHaveAttribute('data-step', /result|notSure|notFound|error|quality|consent/, { timeout: 120_000 });
  if ((await sp.getAttribute('data-step')) === 'quality') {
    await page.getByTestId('quality-issues').getByRole('button').nth(1).click();
    await expect(sp).toHaveAttribute('data-step', /result|notSure|notFound|error|consent/, { timeout: 120_000 });
  }
}

test('no key: the No Pain pack is read on the phone and identified as No Pain; the back adds the expiry', async ({ page }) => {
  test.slow(); // two on-device OCR passes
  const sent: string[] = [];
  page.on('request', (r) => r.url().includes('/api/pack/read') && r.method() === 'POST' && sent.push(r.url()));
  await page.goto('/en/medicine');
  await upload(page, FRONT);
  await settle(page);
  await expect(page.getByTestId('pack-consent')).toHaveCount(0); // no AI service: nothing to agree to
  await expect(page.getByTestId('result-brand')).toHaveText('Nopain');
  await expect(page.getByTestId('result-generic')).toHaveText('Diclofenac Potassium');
  await expect(page.getByTestId('pack-results')).toContainText('50mg · Tablet');
  await expect(page.getByTestId('result-expiry')).toHaveAttribute('data-status', 'unknown');
  await expect(page.getByTestId('expiry-headline')).toHaveText('Expiry date not readable — please check the pack');

  await upload(page, BACK, page.getByTestId('add-back'));
  await expect(page.getByTestId('scan-pack')).not.toHaveAttribute('data-step', 'result'); // the back is being read
  await settle(page);
  await expect(page.getByTestId('scan-notice-backAdded')).toBeVisible();
  await expect(page.getByTestId('result-brand')).toHaveText('Nopain');
  await expect(page.getByTestId('expiry-headline')).toHaveText('OK until February 2027');
  await expect(page.getByTestId('result-read')).toContainText('03/2025'); // MFG kept apart from EXP
  await expect(page.getByTestId('result-read')).toContainText('NP2503');
  await expect(page.getByTestId('result-signs')).toContainText('No suspicious signs found');
  await expect(page.getByTestId('pack-results')).not.toContainText(/fake|genuine|counterfeit/i);
  await expect(page.getByTestId('pharmacist-note')).toHaveText('Confirm with your pharmacist.');
  expect(sent).toEqual([]);
});

test('a shiny strip OCR cannot read: "We couldn\'t read this pack" with tips, no unrelated candidates', async ({ page }) => {
  test.slow();
  await page.goto('/en/medicine');
  await upload(page, 'tests/fixtures/packs/foil-glare.jpg');
  const sp = page.getByTestId('scan-pack');
  await expect(sp).toHaveAttribute('data-step', /unreadable|quality/, { timeout: 120_000 });
  if ((await sp.getAttribute('data-step')) === 'quality') await page.getByTestId('quality-issues').getByRole('button').nth(1).click();
  await expect(sp).toHaveAttribute('data-step', 'unreadable', { timeout: 120_000 });
  await expect(page.getByTestId('unreadable')).toContainText("We couldn't read this pack. Try a clearer photo or type the name");
  await expect(page.getByTestId('unreadable')).toContainText('Shiny foil strips reflect light');
  await expect(page.getByTestId('candidate')).toHaveCount(0);
  await expect(page.getByTestId('unreadable').getByTestId('brand-search')).toBeVisible();
});

test('health endpoint without a key reports missing_key and never a key', async ({ request }) => {
  const body = await (await request.get('/api/llm/health')).json();
  expect(body).toMatchObject({ ok: false, error: 'missing_key' });
  expect(body.advice).toBeTruthy();
});

test('regression with the real No Pain photo (tests/fixtures/packs/no-pain-photo.jpg)', async ({ page }) => {
  test.skip(!existsSync(REAL_PHOTO), 'Add the failing photo as tests/fixtures/packs/no-pain-photo.jpg to run this test');
  test.slow();
  await page.goto('/en/medicine');
  await upload(page, REAL_PHOTO);
  await settle(page);
  const step = await page.getByTestId('scan-pack').getAttribute('data-step');
  if (step === 'notSure') await expect(page.getByTestId('candidate').first()).toHaveAttribute('data-brand', 'Nopain');
  else await expect(page.getByTestId('result-brand')).toHaveText('Nopain');
});

test('Gemini (mocked): consent first, then a strong verified match with the expiry from the pack', async ({ page }) => {
  const posts = await mockGemini(page, [
    { brand: 'No Pain', generic: 'Diclofenac Potassium BP', strength: '50 mg', dosage_form: 'Tablet', manufacturer: 'Drug International Ltd.', expiry_date: 'EXP: AUG 27', manufacturing_date: 'SEP 25', batch_number: 'NP2509', dar_number: '076-123-045', visible_text: 'No Pain\nDiclofenac Potassium BP 50 mg\nTablet\nDrug International Ltd.' },
  ]);
  await openMedicine(page);
  await upload(page, FRONT);
  const consent = page.getByTestId('pack-consent');
  await expect(consent).toContainText('The photo will be sent to an AI service to read the pack.');
  expect(posts).toHaveLength(0); // nothing is sent before the user agrees
  await consent.getByTestId('pack-consent-continue').click();
  await settle(page);
  expect(posts).toHaveLength(1);
  expect((posts[0] as { mediaType: string }).mediaType).toBe('image/jpeg');
  await expect(page.getByTestId('result-brand')).toHaveText('Nopain');
  await expect(page.getByTestId('result-generic')).toHaveText('Diclofenac Potassium');
  await expect(page.getByTestId('expiry-headline')).toHaveText('OK until August 2027');
  await expect(page.getByTestId('result-read')).toContainText('09/2025');
  await expect(page.getByTestId('result-read')).toContainText('076-123-045');
});

test('Gemini (mocked): a weak match shows "Not sure" with candidates; nothing else until the user chooses', async ({ page }) => {
  await mockGemini(page, [{ brand: 'Napa', visible_text: 'Napa', expiry_date: '08/2027' }]);
  await openMedicine(page);
  await upload(page, FRONT);
  await page.getByTestId('pack-consent-continue').click();
  await settle(page);
  const notSure = page.getByTestId('not-sure');
  await expect(notSure).toContainText('Not sure which medicine this is');
  const candidates = notSure.getByTestId('candidate');
  expect(await candidates.count()).toBeGreaterThanOrEqual(2);
  expect(await candidates.count()).toBeLessThanOrEqual(3);
  await expect(notSure.getByTestId('brand-search')).toBeVisible(); // "Type the name"
  await expect(page.getByTestId('result-expiry')).toHaveCount(0);
  await expect(page.getByTestId('pack-results')).toHaveCount(0);
  await candidates.first().click();
  await expect(page.getByTestId('result-brand')).toHaveText(/Napa/);
  await expect(page.getByTestId('expiry-headline')).toHaveText('OK until August 2027');
});

test('Gemini (mocked): a medicine not in the database is said clearly, and the expiry is still checked', async ({ page }) => {
  await mockGemini(page, [{ brand: 'Zyxorin', generic: 'Zyxoridine', strength: '20 mg', dosage_form: 'Capsule', expiry_date: '10/2026', visible_text: 'Zyxorin\nZyxoridine 20 mg\nCapsule\nEXP 10/2026' }]);
  await openMedicine(page);
  await upload(page, FRONT);
  await page.getByTestId('pack-consent-continue').click();
  await settle(page);
  await expect(page.getByTestId('not-found')).toContainText('This medicine is not in our medicine list');
  await expect(page.getByTestId('result-expiry')).toHaveAttribute('data-status', 'expired');
  await expect(page.getByTestId('expiry-headline')).toHaveText('Expired');
  await expect(page.getByTestId('not-found')).toContainText('Do not use it without asking your pharmacist.');
  await expect(page.getByTestId('result-brand')).toHaveCount(0);
});

test('Gemini fails → the pack is read on the phone instead (and "Read on this phone" sends nothing)', async ({ page }) => {
  test.slow();
  const posts = await mockGemini(page, ['error']);
  await openMedicine(page);
  await upload(page, FRONT);
  await page.getByTestId('pack-consent-continue').click();
  await settle(page);
  // Never silent: the user is told, with the reason kept for support.
  await expect(page.getByTestId('scan-notice-aiFallback')).toHaveText('AI reading unavailable right now — read on the phone instead');
  await expect(page.getByTestId('scan-notice-aiFallback')).toHaveAttribute('data-reason', 'invalid_model');
  await expect(page.getByTestId('result-brand')).toHaveText('Nopain');
  expect(posts).toHaveLength(1);

  await openMedicine(page, 'bn');
  await upload(page, FRONT);
  await expect(page.getByTestId('pack-consent')).toContainText('এআই সেবায় পাঠানো হবে');
  await page.getByTestId('pack-consent-local').click();
  await settle(page);
  await expect(page.getByTestId('result-brand')).toHaveText('Nopain');
  await expect(page.getByTestId('expiry-headline')).toHaveText('মেয়াদের তারিখ পড়া যাচ্ছে না — অনুগ্রহ করে প্যাকেটে দেখে নিন');
  expect(posts).toHaveLength(1);
});
