import { expect, test } from '@playwright/test';

test('food model: size shown, download on tap with progress, then ready (real ONNX Runtime in the browser)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/en/diabetes');
  const offer = page.getByTestId('model-offer');
  await expect(offer).toBeVisible();
  await expect(page.getByTestId('model-download')).toHaveText(/Download the model \(11\.7 MB\)/);
  await page.getByTestId('model-download').click();
  await expect(page.getByTestId('model-ready')).toContainText('Model ready (version 0.1.0, 16 types)', { timeout: 60_000 });
  expect(errors).toEqual([]);
});

test('missing metadata → "model not loaded yet", page still works', async ({ page }) => {
  await page.route('**/models/food_seg.json', (r) => r.fulfill({ status: 404, body: '' }));
  await page.goto('/en/diabetes');
  await expect(page.getByTestId('model-not-loaded')).toContainText('Model not loaded yet');
  await expect(page.getByTestId('camera-button')).toBeVisible();
  await expect(page.getByTestId('emergency-button')).toBeVisible();
});

test('missing weights file (.onnx deleted) → "model not loaded yet" before any download', async ({ page }) => {
  await page.route('**/models/food_seg.onnx**', (r) => r.fulfill({ status: 404, body: '' }));
  await page.goto('/en/diabetes');
  await expect(page.getByTestId('model-not-loaded')).toBeVisible();
  await expect(page.getByTestId('model-offer')).toHaveCount(0);
});

test('skin model not trained yet → "model not loaded yet"', async ({ page }) => {
  await page.goto('/en/skin');
  await expect(page.getByTestId('model-not-loaded')).toBeVisible();
});

test('cache headers: weights immutable for a year, metadata always revalidated', async ({ request }) => {
  const onnx = await request.head('/models/food_seg.onnx?v=0.1.0');
  expect(onnx.ok()).toBeTruthy();
  expect(onnx.headers()['cache-control']).toBe('public, max-age=31536000, immutable');
  expect(Number(onnx.headers()['content-length'])).toBe(11_700_578);
  const json = await request.get('/models/food_seg.json');
  expect(json.headers()['cache-control']).toBe('public, max-age=0, must-revalidate');
  const wasm = await request.head('/ort/1.31.1/ort-wasm-simd-threaded.wasm');
  expect(wasm.ok()).toBeTruthy();
  expect(wasm.headers()['cache-control']).toContain('immutable');
});
