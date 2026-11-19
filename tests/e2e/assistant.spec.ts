/** Nirapod Assistant without any AI key: safety rules and database answers still work. */
import { expect, test, type Page } from '@playwright/test';

async function ask(page: Page, text: string) {
  await page.getByTestId('chat-input').fill(text);
  await page.getByTestId('chat-send').click();
}

test('no key: a name question is answered from the database; disclaimer on every answer; clear works', async ({ page }) => {
  await page.goto('/en/assistant');
  await expect(page.getByTestId('assistant-ai-off')).toBeVisible();
  await expect(page.getByTestId('assistant-links')).toContainText('Scan a medicine pack');
  await expect(page.getByTestId('chat-starters')).toBeVisible();
  await ask(page, 'What is Napa?');
  const answer = page.getByTestId('chat-assistant').last();
  await expect(answer.getByTestId('chat-medicine-name')).toHaveText('Napa');
  await expect(answer.getByTestId('chat-medicine-generic')).toHaveText('Paracetamol');
  await expect(answer.getByTestId('chat-disclaimer')).toHaveText('Information only, not medical advice');
  await expect(answer.getByTestId('chat-sources')).toHaveCount(0); // no web without AI

  // History stays on the phone across reloads, until cleared.
  await page.reload();
  await expect(page.getByTestId('chat-assistant')).toHaveCount(1);
  await page.getByTestId('chat-clear').click();
  await expect(page.getByTestId('chat-assistant')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('chat-starters')).toBeVisible();
});

test('a dose question is refused', async ({ page }) => {
  await page.goto('/en/assistant');
  await ask(page, 'How many Napa can I take a day?');
  const r = page.getByTestId('chat-refusal');
  await expect(r).toHaveAttribute('data-reason', 'dose');
  await expect(page.getByTestId('chat-answer').last()).toContainText('Ask your doctor or pharmacist; do not stop on your own.');
});

test('a danger-sign message shows the Emergency 999 card first (Bangla)', async ({ page }) => {
  await page.goto('/bn/assistant');
  await ask(page, 'আব্বার বুকে ব্যথা হচ্ছে, কী ওষুধ দেব?');
  const reply = page.getByTestId('chat-assistant').last();
  const first = reply.locator(':scope > div > *').first();
  await expect(first).toHaveAttribute('data-testid', 'chat-emergency');
  await expect(reply.getByTestId('alert-call-999')).toHaveAttribute('href', 'tel:999');
  await expect(reply.getByTestId('chat-disclaimer')).toHaveText('শুধু তথ্যের জন্য, চিকিৎসা পরামর্শ নয়');
});

test('skin photos are not offered; works at 360 px without sideways scroll; reachable from home and header', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/en');
  await page.getByTestId('module-assistant').click();
  await expect(page).toHaveURL(/\/en\/assistant$/);
  await page.getByTestId('chat-attach-button').click();
  const attach = page.getByTestId('chat-attach');
  await expect(attach.locator('[data-testid^="attach-"]')).toHaveCount(3);
  await expect(attach).toContainText('Skin photos are not accepted in chat');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  for (const b of await page.locator('[data-testid="chat-form"] button').all()) {
    const box = (await b.boundingBox())!;
    expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
  }
  await page.goto('/en/medicine');
  await page.getByTestId('nav-assistant').click();
  await expect(page).toHaveURL(/\/en\/assistant$/);
});

test('no key: a pack photo is read on the phone and returns name and expiry', async ({ page }) => {
  test.slow();
  await page.goto('/en/assistant');
  await page.getByTestId('starter-what').click();
  await expect(page.getByTestId('chat-hint')).toBeVisible();
  await page.getByTestId('chat-attach').getByTestId('gallery-input').setInputFiles('tests/fixtures/packs/no-pain-front.jpg');
  await expect(page.getByTestId('chat-consent')).toHaveCount(0); // nothing is sent without AI
  const card = page.getByTestId('chat-card-pack');
  await expect(card).toBeVisible({ timeout: 120_000 });
  await expect(card.getByTestId('chat-medicine-name')).toHaveText('Nopain');
  await expect(card.getByTestId('chat-expiry')).toHaveAttribute('data-status', 'unknown');
});
