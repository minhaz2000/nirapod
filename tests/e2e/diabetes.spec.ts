import { expect, test, type Page } from '@playwright/test';
import { onboardDemo, seedIndexedDb, setDemoMode } from './helpers';

async function addFood(page: Page, cls: string, size: 'Small' | 'Medium' | 'Large') {
  await page.getByTestId('add-food-class').selectOption(cls);
  await page.getByTestId('add-missed').getByRole('button', { name: size, exact: true }).click();
  await page.getByTestId('add-food').click();
}

test('API: carbs per 100 g for a model class (FoodNetBD)', async ({ request }) => {
  const body = await (await request.get('/api/food/nutrition?class=rice')).json();
  expect(body.food).toMatchObject({ modelClass: 'rice', nameEn: 'Boiled Rice BR-28', carbsPer100g: 24.3, densityGPerCm3: 0.8, typicalHeightCm: 2.5 });
  expect(body.source.licence).toBe('CC BY 4.0');
  expect((await (await request.get('/api/food/nutrition')).json()).foods).toHaveLength(16);
  expect((await request.get('/api/food/nutrition?class=pizza')).status()).toBe(404);
});

test('onboarding: proof photo required, then control level from fasting + HbA1c', async ({ page }) => {
  await page.goto('/en/diabetes');
  await page.getByTestId('onboarding-fasting').fill('9.5');
  await page.getByTestId('onboarding-start').click();
  await expect(page.getByTestId('onboarding-error')).toContainText('photo of your prescription');
  await page.getByTestId('diabetes-onboarding').getByTestId('gallery-input').setInputFiles('public/samples/prescription.png');
  await expect(page.getByTestId('proof-saved')).toBeVisible();
  await page.getByTestId('onboarding-hba1c').fill('8.6');
  await page.getByTestId('onboarding-start').click();
  await expect(page.getByTestId('control-level')).toHaveAttribute('data-level', 'poor');
  await expect(page.getByTestId('trial-left')).toHaveText('Free trial: 49 days left');
});

test('meal: add foods, one-tap correction, green / amber / red with one suggestion (never medicine)', async ({ page }) => {
  await onboardDemo(page); // fair control: green ≤ 50 g, amber ≤ 75 g
  await page.getByTestId('meal-manual').click();
  await addFood(page, 'rice', 'Large'); // 133 cm² × 2.5 × 0.8 = 265 g → 64 g carbs
  await expect(page.getByTestId('portion-total')).toHaveText('Total: about 64 g carbs');
  await page.getByTestId('portion').filter({ hasText: 'Rice' }).getByTestId('portion-more').click();
  await expect(page.getByTestId('portion-total')).toHaveText('Total: about 90 g carbs');
  await addFood(page, 'fish', 'Medium');
  await page.getByTestId('meal-confirm').click();
  const signal = page.getByTestId('meal-signal');
  await expect(signal).toHaveAttribute('data-signal', 'red');
  await expect(page.getByTestId('meal-suggestion')).toContainText('half the rice');
  await expect(signal).not.toContainText(/medicine|insulin|dose/i);
  await expect(page.getByTestId('meal-saved')).toContainText('2-hour sugar');
});

test('rule 6: a low reading shows emergency guidance and links to Part 4 (mmol/L and mg/dL)', async ({ page }) => {
  await onboardDemo(page);
  await page.getByTestId('tab-glucose').click();
  await page.getByTestId('glucose-value').fill('3.2');
  await page.getByTestId('glucose-save').click();
  await expect(page.getByTestId('low-glucose-alert')).toContainText('Take something sweet now');
  await expect(page.getByTestId('low-glucose-emergency')).toHaveAttribute('href', '/en/emergency?signs=lowGlucose');
  await expect(page.getByTestId('glucose-recent')).toContainText('Low');

  await page.getByTestId('low-glucose-emergency').click();
  await expect(page.getByTestId('emergency-alert')).toBeVisible();
  await expect(page.getByTestId('alert-advice')).toContainText('something sweet');
});

test('rule 6 at onboarding too (65 mg/dL)', async ({ page }) => {
  await setDemoMode(page);
  await page.goto('/en/diabetes');
  await page.getByTestId('diabetes-onboarding').getByTestId('gallery-input').setInputFiles('public/samples/prescription.png');
  await page.getByText('mg/dL', { exact: true }).click();
  await page.getByTestId('onboarding-fasting').fill('65');
  await page.getByTestId('onboarding-start').click();
  await expect(page.getByTestId('low-glucose-alert')).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.getByTestId('low-glucose-alert')).toBeVisible(); // stays until the user continues
  await page.getByTestId('onboarding-continue').click();
  await expect(page.getByTestId('diabetes-app')).toBeVisible();
});

test('learning: after 5 high 2-hour readings for rice, rice meals get a stricter signal and the pattern is shown', async ({ page }) => {
  await onboardDemo(page);
  const day = 86_400_000;
  const base = Date.now() - 10 * day;
  const meals = Array.from({ length: 5 }, (_, i) => ({
    id: 1000 + i,
    personId: 'me',
    takenAt: base + i * day,
    foods: [{ modelClass: 'rice', grams: 200, carbs: 49, source: 'added', confidence: null, correction: 'right' }],
    carbs: 49,
    signal: 'green',
    baseSignal: 'green',
    adjusted: null,
    mainFood: 'rice',
    suggestion: 'walkAfter',
  }));
  await seedIndexedDb(page, 'meals', meals);
  await seedIndexedDb(
    page,
    'glucose',
    meals.map((m, i) => ({ personId: 'me', takenAt: m.takenAt + 120 * 60_000, mmol: [11.2, 10.8, 12.1, 10.4, 11.5][i], kind: 'twoHour', mealId: m.id })),
  );
  await page.reload();
  await page.getByTestId('tab-patterns').click();
  await expect(page.getByTestId('pattern').first()).toHaveAttribute('data-adjustment', 'stricter');
  await expect(page.getByTestId('pattern').first()).toContainText('Rice: 5 readings, 2-hour average 11.2 mmol/L');

  // A rice meal that would be green (≤ 50 g at fair control) is now amber.
  await page.getByTestId('tab-meal').click();
  await page.getByTestId('meal-manual').click();
  await addFood(page, 'rice', 'Medium'); // 39 g carbs
  await page.getByTestId('meal-confirm').click();
  await expect(page.getByTestId('meal-signal')).toHaveAttribute('data-signal', 'amber');
  await expect(page.getByTestId('meal-adjusted')).toContainText('one step stricter');
});

test('Bangla: food names and signal in Bangla', async ({ page }) => {
  await onboardDemo(page, 'bn');
  await page.getByTestId('meal-manual').click();
  await page.getByTestId('add-food-class').selectOption('ruti');
  await page.getByTestId('add-missed').getByRole('button', { name: 'মাঝারি', exact: true }).click();
  await page.getByTestId('add-food').click();
  await expect(page.getByTestId('portion').first()).toContainText('রুটি');
  await page.getByTestId('meal-confirm').click();
  await expect(page.getByTestId('meal-signal')).toContainText('সবুজ');
});
