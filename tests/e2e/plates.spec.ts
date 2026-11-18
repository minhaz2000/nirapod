/**
 * Real food_seg.onnx inference on the user's sample plate photos, through the app (exact app preprocessing).
 * Compared with Ultralytics' predictions on the same model (tests/fixtures/food-seg-plates.json) with tolerances.
 */
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { setDemoMode } from './helpers';

type Box = [number, number, number, number];
interface Det {
  label: string;
  score: number;
  area: number;
  box: Box;
}
const fixture = JSON.parse(readFileSync('tests/fixtures/food-seg-plates.json', 'utf8')) as { plates: Record<string, { ultralytics: Det[] }> };

function iou(a: Box, b: Box) {
  const w = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
  const h = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const inter = w * h;
  return inter / ((a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter);
}

async function ready(page: Page) {
  await setDemoMode(page);
  await page.goto('/en/diabetes');
  await page.getByTestId('onboarding-demo').click();
  await expect(page.getByTestId('demo-plates').locator('button')).toHaveCount(2); // the sample photos are present
  await page.getByTestId('model-download').click();
  await expect(page.getByTestId('model-ready')).toBeVisible({ timeout: 60_000 });
}

async function analyse(page: Page, n: 1 | 2) {
  await page.getByTestId(`demo-plate-${n}`).click();
  await expect(page.getByTestId('portion-confirm')).toBeVisible({ timeout: 60_000 });
  return JSON.parse((await page.getByTestId('meal-canvas').getAttribute('data-analysis'))!) as { ms: number; detections: Det[] };
}

for (const n of [1, 2] as const) {
  test(`plate-${n}: app inference matches Ultralytics (labels, boxes, confidence, mask area)`, async ({ page }) => {
    test.slow();
    await ready(page);
    const app = await analyse(page, n);
    // Detections clearly above the candidate cut-off must match one to one (borderline ones near 0.25 may differ
    // because the browser and OpenCV resize the photo slightly differently).
    for (const ref of fixture.plates[`plate-${n}.jpg`]!.ultralytics.filter((d) => d.score >= 0.3)) {
      const best = app.detections.filter((d) => d.label === ref.label).sort((a, b) => iou(b.box, ref.box) - iou(a.box, ref.box))[0];
      expect(best, `${ref.label} at ${ref.box}`).toBeTruthy();
      expect(iou(best!.box, ref.box)).toBeGreaterThan(0.9);
      expect(Math.abs(best!.score - ref.score)).toBeLessThan(0.03);
      expect(Math.abs(best!.area - ref.area)).toBeLessThan(Math.max(0.003, ref.area * 0.15));
    }
    expect(app.detections.filter((d) => d.score >= 0.3)).toHaveLength(fixture.plates[`plate-${n}.jpg`]!.ultralytics.filter((d) => d.score >= 0.3).length);
  });
}

test('stage demo: model misses are fixed with one tap, and the signal follows the corrected plate', async ({ page }) => {
  test.slow();
  await ready(page); // demo profile: fair control (green ≤ 50 g, amber ≤ 75 g)

  // Plate 1: rice is only a weak "not sure", the dal bowl is named "vegetable", the drink is not found.
  await analyse(page, 1);
  await expect(page.getByTestId('staple-hint')).toBeVisible();
  const unsure = () => page.locator('[data-testid="portion"][data-food=""]');
  await expect(unsure()).toHaveCount(3);
  await expect(page.getByTestId('meal-confirm')).toBeDisabled(); // rule 5: the user names every "not sure" food first
  await unsure().nth(0).getByTestId('portion-choose').selectOption('salad');
  await unsure().first().getByText('Remove').click(); // lime slice
  await unsure().first().getByTestId('portion-choose').selectOption('rice');
  await expect(page.getByTestId('staple-hint')).toHaveCount(0);
  await page.locator('[data-testid="portion"][data-food="vegetable"]').first().getByTestId('portion-change').selectOption('daal');
  await page.locator('[data-testid="portion"][data-food="rice"]').getByTestId('portion-more').click();
  await page.getByTestId('add-food-class').selectOption('matha');
  await page.getByTestId('add-missed').getByRole('button', { name: 'Small', exact: true }).click();
  await page.getByTestId('add-food').click();
  await page.getByTestId('meal-confirm').click();
  await expect(page.getByTestId('meal-signal')).toHaveAttribute('data-signal', 'red');
  await expect(page.getByTestId('meal-suggestion')).toContainText('half the rice');

  // Plate 2: rice is missed completely; the prawn curry is a weak "chola".
  await page.getByRole('button', { name: 'Check another meal' }).click();
  await analyse(page, 2);
  await expect(page.getByTestId('staple-hint')).toBeVisible();
  await unsure().first().getByTestId('portion-choose').selectOption('fish');
  await page.getByTestId('quick-add-rice').click();
  await expect(page.getByTestId('portion-total')).toHaveText(/Total: about (3\d|4\d|5\d) g carbs/);
  await page.getByTestId('meal-confirm').click();
  await expect(page.getByTestId('meal-signal')).toHaveAttribute('data-signal', /green|amber/);

  // The stage demo carries on: 2-hour prompt, sugar entry, patterns, report.
  await page.getByTestId('tab-glucose').click();
  await page.getByTestId('glucose-value').fill('9.4');
  await page.getByTestId('glucose-save').click();
  await expect(page.getByTestId('glucose-recent')).toContainText('9.4');
  await page.goto('/en/diabetes/report');
  await expect(page.getByTestId('report-meals')).toContainText('2 meals');
});
