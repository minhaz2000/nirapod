/**
 * Photos from the gallery (not only the camera): every flow has a "Choose from gallery" input without
 * capture=environment; EXIF orientation is respected, large photos are downscaled, and files the browser cannot
 * open (HEIC on some Android browsers) get a clear bilingual message instead of a crash.
 */
import { expect, test, type Page } from '@playwright/test';
import { setDemoMode } from './helpers';

type Box = [number, number, number, number];
interface Analysis {
  srcW: number;
  srcH: number;
  detections: { label: string; score: number; box: Box }[];
}

function iou(a: Box, b: Box) {
  const w = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
  const h = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const inter = w * h;
  return inter / ((a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter);
}

async function mealReady(page: Page) {
  await setDemoMode(page);
  await page.goto('/en/diabetes');
  await page.getByTestId('onboarding-demo').click();
  await page.getByTestId('model-download').click();
  await expect(page.getByTestId('model-ready')).toBeVisible({ timeout: 60_000 });
}

async function plateFromGallery(page: Page, file: string): Promise<Analysis> {
  const meal = page.getByTestId('meal-check');
  await meal.getByTestId('gallery-input').setInputFiles(file);
  await expect(page.getByTestId('portion-confirm')).toBeVisible({ timeout: 60_000 });
  return JSON.parse((await page.getByTestId('meal-canvas').getAttribute('data-analysis'))!) as Analysis;
}

test('both buttons on every photo step: camera input has capture, gallery input does not', async ({ page }) => {
  for (const path of ['/en', '/en/medicine', '/en/skin']) {
    await page.goto(path);
    const camera = page.getByTestId('camera-input');
    const gallery = page.getByTestId('gallery-input');
    expect(await camera.count()).toBeGreaterThan(0);
    expect(await gallery.count()).toBe(await camera.count());
    for (let i = 0; i < (await camera.count()); i++) {
      await expect(camera.nth(i)).toHaveAttribute('capture', 'environment');
      expect(await gallery.nth(i).getAttribute('capture')).toBeNull();
      await expect(gallery.nth(i)).toHaveAttribute('accept', 'image/*');
      for (const btn of [page.getByTestId('camera-button').nth(i), page.getByTestId('gallery-button').nth(i)]) {
        const box = (await btn.boundingBox())!;
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.width).toBeGreaterThanOrEqual(44);
      }
    }
  }
  await page.goto('/bn/medicine');
  await expect(page.getByTestId('gallery-button').first()).toContainText('গ্যালারি থেকে বেছে নিন');
});

test('plate from the gallery: upright and EXIF-rotated copies give the same foods in the same places', async ({ page }) => {
  test.slow();
  await mealReady(page);
  const upright = await plateFromGallery(page, 'public/samples/plate-1.jpg');
  expect(upright.detections.length).toBeGreaterThan(0);
  await page.goto('/en/diabetes');
  const download = page.getByTestId('model-download');
  await expect(download.or(page.getByTestId('model-ready'))).toBeVisible();
  if (await download.isVisible()) await download.click();
  await expect(page.getByTestId('model-ready')).toBeVisible({ timeout: 60_000 });
  // Same photo stored sideways (488 × 409) with EXIF Orientation 6.
  const rotated = await plateFromGallery(page, 'tests/fixtures/plate-1-exif6.jpg');
  expect([rotated.srcW, rotated.srcH]).toEqual([upright.srcW, upright.srcH]);
  for (const ref of upright.detections.filter((d) => d.score >= 0.4)) {
    const best = rotated.detections.filter((d) => d.label === ref.label).sort((a, b) => iou(b.box, ref.box) - iou(a.box, ref.box))[0];
    expect(best, ref.label).toBeTruthy();
    expect(iou(best!.box, ref.box)).toBeGreaterThan(0.8);
  }
});

test('a very large gallery photo is downscaled to 1600 px before processing', async ({ page }) => {
  test.slow();
  await mealReady(page);
  const a = await plateFromGallery(page, 'tests/fixtures/plate-1-large.jpg'); // 1636 × 1952
  expect(Math.max(a.srcW, a.srcH)).toBe(1600);
  expect(a.srcW / a.srcH).toBeCloseTo(1636 / 1952, 2);
  expect(a.detections.length).toBeGreaterThan(0);
});

test('HEIC the browser cannot open: clear message asking for JPG / PNG (English and Bangla), no crash', async ({ page }) => {
  test.slow();
  await mealReady(page);
  await page.getByTestId('meal-check').getByTestId('gallery-input').setInputFiles('tests/fixtures/photo.heic');
  const err = page.getByTestId('meal-check').getByTestId('photo-error');
  await expect(err).toHaveAttribute('data-kind', 'unsupported');
  await expect(err).toContainText('JPG or PNG');
  await expect(page.getByTestId('meal-check')).toHaveAttribute('data-step', 'idle'); // can try again
  await expect(page.getByTestId('emergency-button').first()).toBeVisible();

  await page.goto('/bn/medicine');
  await page.getByTestId('scan-pack').getByTestId('gallery-input').setInputFiles('tests/fixtures/photo.heic');
  await expect(page.getByTestId('scan-pack').getByTestId('photo-error')).toContainText('JPG বা PNG');
  await expect(page.getByTestId('scan-pack')).toHaveAttribute('data-step', 'idle');
  await page.getByTestId('report-step').getByTestId('gallery-input').setInputFiles('tests/fixtures/photo.heic');
  await expect(page.getByTestId('report-step').getByTestId('photo-error')).toContainText('JPG বা PNG');
});

test('medicine pack from the gallery: OCR → verified medicine', async ({ page }) => {
  test.slow();
  await page.goto('/en/medicine');
  await page.getByTestId('scan-pack').getByTestId('gallery-input').setInputFiles('public/samples/medicine-pack-ok.png');
  await expect(page.getByTestId('result-brand')).toHaveText('Napa', { timeout: 90_000 });
  await expect(page.getByTestId('read-as')).toContainText('Napa');
});

test('lab report from the gallery: values with ranges, read on the phone', async ({ page }) => {
  test.slow();
  const uploads: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && (r.postDataBuffer()?.length ?? 0) > 20_000) uploads.push(r.url());
  });
  await page.goto('/en/medicine');
  await page.getByTestId('report-step').getByTestId('gallery-input').setInputFiles('public/samples/lab-report.png');
  const values = page.getByTestId('report-values');
  await expect(values.locator('li')).toHaveCount(6, { timeout: 90_000 });
  await expect(values.locator('li[data-status="high"]')).toHaveCount(3);
  expect(uploads).toEqual([]); // the report photo stayed on the phone
});

test('skin photo from the gallery stays on the device', async ({ page }) => {
  const posts: string[] = [];
  page.on('request', (r) => {
    if (r.method() !== 'GET') posts.push(r.url());
  });
  await page.goto('/en/skin');
  await page.getByTestId('gallery-input').setInputFiles('public/samples/plate-2.jpg');
  await expect(page.getByRole('status').filter({ hasText: 'plate-2.jpg' })).toBeVisible();
  await page.getByTestId('gallery-input').setInputFiles('tests/fixtures/photo.heic');
  await expect(page.getByTestId('photo-error')).toHaveAttribute('data-kind', 'unsupported');
  expect(posts).toEqual([]);
});

test('desktop: drop and paste an image onto the photo area', async ({ page }) => {
  await page.goto('/en/skin');
  const zone = page.getByTestId('photo-drop');
  const bytes = Array.from(await (await page.request.get('/samples/plate-1.jpg')).body());
  const dataTransfer = await page.evaluateHandle((b) => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(b)], 'dropped.jpg', { type: 'image/jpeg' }));
    return dt;
  }, bytes);
  await zone.dispatchEvent('drop', { dataTransfer });
  await expect(page.getByRole('status').filter({ hasText: 'dropped.jpg' })).toBeVisible();

  await zone.evaluate((el, b) => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(b)], 'pasted.jpg', { type: 'image/jpeg' }));
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, bytes);
  await expect(page.getByRole('status').filter({ hasText: 'pasted.jpg' })).toBeVisible();
});
