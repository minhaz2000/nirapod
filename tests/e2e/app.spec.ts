import { expect, test } from '@playwright/test';

const PAGES = ['', '/diabetes', '/skin', '/medicine', '/emergency', '/settings', '/about'];

test('root redirects to Bangla by default', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/bn$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'bn');
});

test('home shows the camera button and four module cards', async ({ page }) => {
  await page.goto('/en');
  await expect(page.getByTestId('camera-button')).toBeVisible();
  for (const m of ['diabetes', 'skin', 'medicine', 'emergency']) {
    await expect(page.getByTestId(`module-${m}`)).toBeVisible();
  }
});

for (const path of PAGES) {
  test(`emergency button and language switch on /bn${path}`, async ({ page }) => {
    await page.goto(`/bn${path}`);
    await expect(page.getByTestId('emergency-button')).toBeVisible();
    await expect(page.getByTestId('language-switch').first()).toBeVisible();
  });
}

test('language switch toggles bn ⇄ en and keeps the page', async ({ page }) => {
  await page.goto('/bn/skin');
  await page.getByTestId('language-switch').first().click();
  await expect(page).toHaveURL(/\/en\/skin$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Private Skin Screening');
});

test('emergency button reaches one-tap call 999', async ({ page }) => {
  await page.goto('/en/medicine');
  await page.getByTestId('emergency-button').click();
  await expect(page).toHaveURL(/\/en\/emergency$/);
  await expect(page.getByTestId('call-999')).toHaveAttribute('href', 'tel:999');
});

test('missing model shows "model not loaded yet" instead of crashing', async ({ page }) => {
  await page.goto('/en/skin');
  await expect(page.getByTestId('model-not-loaded')).toBeVisible();
});

test('settings: demo mode persists and delete all my data resets it', async ({ page }) => {
  const ready = page.locator('[data-ready="true"]');
  await page.goto('/en/settings');
  await expect(ready).toBeVisible();
  const demo = page.getByTestId('demo-mode');
  await demo.check();
  await expect(demo).toBeChecked();
  await page.reload();
  await expect(ready).toBeVisible();
  await expect(demo).toBeChecked();
  page.once('dialog', (d) => d.accept());
  await page.getByTestId('delete-all').click();
  await expect(page.getByRole('status')).toHaveText('All your data has been deleted.');
  await page.reload();
  await expect(ready).toBeVisible();
  await expect(demo).not.toBeChecked();
});

test('PWA manifest and service worker are served', async ({ request }) => {
  const manifest = await request.get('/manifest.webmanifest');
  expect(manifest.ok()).toBeTruthy();
  expect((await manifest.json()).start_url).toBe('/bn');
  expect((await request.get('/sw.js')).ok()).toBeTruthy();
});
