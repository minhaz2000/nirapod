/**
 * Nirapod Assistant with Gemini "configured" against a local mock (tests/e2e/mock-gemini.mjs): the real server
 * code runs (planning, tools, web grounding, validation), only Google's answers are canned.
 */
import { expect, test, type Page } from '@playwright/test';

async function ask(page: Page, text: string) {
  await page.getByTestId('chat-input').fill(text);
  await page.getByTestId('chat-send').click();
}

test('a pack photo (after consent) returns the name and the expiry', async ({ page }) => {
  await page.goto('/en/assistant');
  await expect(page.getByTestId('assistant')).toHaveAttribute('data-ai', 'true');
  await page.getByTestId('chat-attach-button').click();
  await page.getByTestId('attach-pack').click();
  await page.getByTestId('chat-attach').getByTestId('gallery-input').setInputFiles('tests/fixtures/packs/no-pain-front.jpg');
  await expect(page.getByTestId('chat-consent')).toContainText('Names and phone numbers are removed first');
  await page.getByTestId('chat-consent-continue').click();
  const card = page.getByTestId('chat-card-pack');
  await expect(card).toHaveAttribute('data-verdict', 'strong', { timeout: 60_000 });
  await expect(card.getByTestId('chat-medicine-name')).toHaveText('Nopain');
  await expect(card.getByTestId('chat-medicine-generic')).toHaveText('Diclofenac Potassium');
  await expect(card.getByTestId('chat-expiry')).toHaveAttribute('data-status', 'ok');
  await expect(card.getByTestId('chat-expiry')).toContainText('OK until 08/2027');

  // Follow-up uses the verified pack as context.
  await ask(page, 'When does it expire?');
  await expect(page.getByTestId('chat-assistant').last().getByTestId('chat-expiry')).toContainText('08/2027');
});

test('a name question returns database info and web sources', async ({ page }) => {
  await page.goto('/en/assistant');
  await ask(page, 'What is Napa used for?');
  const reply = page.getByTestId('chat-assistant').last();
  await expect(reply.getByTestId('chat-medicine-name')).toHaveText('Napa', { timeout: 30_000 });
  await expect(reply.getByTestId('chat-medicine-generic')).toHaveText('Paracetamol');
  await expect(reply.getByTestId('chat-answer')).toContainText('Napa is in our medicine list');
  const sources = reply.getByTestId('chat-sources').getByRole('link');
  await expect(sources).toHaveCount(2);
  await expect(sources.first()).toHaveAttribute('href', 'https://www.nhs.uk/medicines/paracetamol-for-adults/');
  await expect(reply.getByTestId('chat-sources')).toContainText('Our medicine database wins');
  await expect(reply.getByTestId('chat-disclaimer')).toHaveText('Information only, not medical advice');
});

test('a dose question is refused even with AI available', async ({ page }) => {
  await page.goto('/en/assistant');
  await ask(page, 'Should I increase my insulin dose?');
  await expect(page.getByTestId('chat-refusal')).toHaveAttribute('data-reason', 'dose');
});

test('a danger-sign message shows the Emergency 999 card first', async ({ page }) => {
  await page.goto('/en/assistant');
  await ask(page, 'my sugar is 3.1 and I feel shaky');
  const reply = page.getByTestId('chat-assistant').last();
  await expect(reply.getByTestId('chat-emergency')).toContainText('give something sweet now');
  await expect(reply.getByTestId('alert-call-999')).toHaveAttribute('href', 'tel:999');
});

test('health endpoint reports ok with the configured (mock) model', async ({ request }) => {
  const body = await (await request.get('/api/llm/health')).json();
  expect(body).toMatchObject({ ok: true, provider: 'gemini', model: 'mock-flash', modelListed: true });
  expect(JSON.stringify(body)).not.toContain('test-key');
});
