import { expect, test } from '@playwright/test';
import { setDemoMode } from './helpers';

test('demo: two weeks of sample data make patterns, charts, medicines and the doctor report look real', async ({ page }) => {
  await setDemoMode(page);
  await page.goto('/en/diabetes');
  await page.getByTestId('onboarding-demo-data').click();
  await expect(page.getByTestId('diabetes-app')).toBeVisible();

  await page.getByTestId('tab-patterns').click();
  await expect(page.getByTestId('pattern').filter({ hasText: 'Rice' })).toHaveAttribute('data-adjustment', 'stricter');
  await expect(page.getByTestId('pattern').filter({ hasText: 'Ruti' })).toHaveAttribute('data-adjustment', 'relaxed');

  await page.getByTestId('tab-glucose').click();
  await page.getByTestId('chart-30').click();
  await expect(page.getByTestId('glucose-chart').locator('circle[data-level="low"]')).toHaveCount(1);
  await expect(page.getByTestId('stat-lows')).toHaveText('1 low reading');

  await page.getByTestId('tab-medicines').click();
  await expect(page.getByTestId('medicine')).toHaveCount(2);
  await expect(page.getByTestId('adherence').first()).toContainText(/taken \d+ of \d+ doses/);

  await page.getByTestId('tab-care').click();
  await expect(page.locator('[data-testid="checkup"][data-due="true"]')).toHaveCount(2); // foot (never), kidney (overdue)

  await page.goto('/en/diabetes/report');
  await expect(page.getByTestId('report-medicines').locator('tbody tr')).toHaveCount(2);
  await expect(page.getByTestId('report-meals')).toContainText('28 meals');
  await expect(page.getByTestId('report-lows')).toContainText('Low readings (below 3.9 mmol/L): 1');
});

test('demo plate buttons appear only when the sample plate photos exist', async ({ page, request }) => {
  const present = (await request.head('/samples/plate-1.jpg')).ok();
  await setDemoMode(page);
  await page.goto('/en/diabetes');
  await page.getByTestId('onboarding-demo').click();
  await expect(page.getByTestId('meal-check')).toBeVisible();
  await expect(page.getByTestId('demo-plates')).toHaveCount(present ? 1 : 0);
});
