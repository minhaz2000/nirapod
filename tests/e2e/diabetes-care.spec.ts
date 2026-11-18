import { expect, test, type Page } from '@playwright/test';
import { onboardDemo, seedIndexedDb, setDemoMode } from './helpers';

const DAY = 86_400_000;

async function tab(page: Page, id: string) {
  await page.getByTestId(`tab-${id}`).click();
}

async function seedTwoWeeks(page: Page) {
  const now = Date.now();
  const readings = Array.from({ length: 14 }, (_, d) => [
    { personId: 'me', takenAt: now - (d + 1) * DAY + 7 * 3_600_000, mmol: d === 3 ? 3.4 : 6.8 + (d % 3) * 0.6, kind: 'fasting' },
    { personId: 'me', takenAt: now - (d + 1) * DAY + 15 * 3_600_000, mmol: d % 4 === 0 ? 11.6 : 8.9, kind: 'twoHour' },
  ]).flat();
  await seedIndexedDb(page, 'glucose', readings);
}

test('medicines: schedule from the instruction as written; a missed dose never suggests a double dose', async ({ page }) => {
  await onboardDemo(page);
  await tab(page, 'medicines');
  await expect(page.getByTestId('medicines-none')).toBeVisible();
  await page.getByTestId('add-medicine').locator('summary').click();
  await page.getByTestId('med-brand').fill('Comet');
  await page.getByTestId('med-frequency').fill('1+0+1');
  await expect(page.getByTestId('med-times')).toHaveText('Reminder times: 08:00, 21:00');
  await page.getByTestId('med-save').click();
  await expect(page.getByTestId('medicine')).toContainText('Comet');
  await expect(page.getByTestId('dose')).toHaveCount(2);
  await page.getByTestId('dose').first().getByTestId('dose-missed').click();
  await expect(page.getByTestId('missed-advice')).toHaveText('Ask your doctor or pharmacist what to do. Do not take an extra dose on your own.');
  await page.getByTestId('dose').last().getByTestId('dose-taken').click();
  await expect(page.getByTestId('dose').last()).toHaveAttribute('data-status', 'taken');
  await expect(page.getByTestId('medicines-panel')).not.toContainText(/double|take it now|skip the next/i);
});

test('medicines from a confirmed prescription (Part 3) become reminders', async ({ page }) => {
  await onboardDemo(page);
  await page.goto('/en/medicine');
  for (const name of ['Comet', 'Napa']) {
    await page.getByTestId('add-line').click();
    const line = page.locator('[data-testid="rx-line"][data-confirmed="false"]').last();
    await line.getByTestId('line-medicine').fill(name);
    await line.getByTestId('line-frequency').fill('1+0+1');
    await line.getByTestId('confirm-line').click({ timeout: 15_000 });
  }
  await page.getByTestId('explain-check').click();
  await page.getByTestId('add-to-reminders').getByRole('button').click();
  await expect(page.getByTestId('reminders-added')).toHaveText('2 medicines added to reminders.');
  await page.goto('/en/diabetes');
  await tab(page, 'medicines');
  await expect(page.getByTestId('medicine')).toHaveCount(2);
  await expect(page.getByTestId('medicine').first()).toContainText('From prescription');
});

test('check-ups: default intervals, editable, mark done', async ({ page }) => {
  await onboardDemo(page);
  await tab(page, 'care');
  const items = page.getByTestId('checkup');
  await expect(items).toHaveCount(4);
  await expect(items.first()).toContainText('HbA1c test');
  await expect(items.first().getByTestId('checkup-interval')).toHaveValue('3');
  await expect(items.first()).toHaveAttribute('data-due', 'true');
  await items.first().getByTestId('checkup-done').click();
  await expect(items.first()).toHaveAttribute('data-due', 'false');
  await expect(items.first()).toContainText('Next due');
  await items.nth(1).getByTestId('checkup-interval').selectOption('6');
  await page.reload();
  await tab(page, 'care');
  await expect(page.getByTestId('checkup').nth(1).getByTestId('checkup-interval')).toHaveValue('6');
});

test('glucose log: weekly and monthly charts show low and high readings clearly', async ({ page }) => {
  await onboardDemo(page);
  await seedTwoWeeks(page);
  await page.reload();
  await tab(page, 'glucose');
  const chart = page.getByTestId('glucose-chart');
  await expect(chart).toBeVisible();
  await expect(chart.locator('circle[data-level="low"]')).toHaveCount(1);
  await expect(page.getByTestId('stat-lows')).toHaveText('1 low reading');
  await page.getByTestId('chart-30').click();
  await expect(chart.locator('circle')).toHaveCount(28);
  await expect(chart).toHaveAttribute('aria-label', /28 readings, 1 low, 4 high/);
});

test('doctor visit report: one printable page in the chosen language', async ({ page }) => {
  await onboardDemo(page);
  await seedTwoWeeks(page);
  await page.goto('/en/diabetes/report');
  const report = page.getByTestId('doctor-report');
  await expect(report).toContainText('Diabetes report for the doctor');
  await expect(page.getByTestId('report-readings').locator('tbody tr')).toHaveCount(28);
  await expect(page.getByTestId('report-lows')).toContainText('Low readings (below 3.9 mmol/L): 1');
  await expect(page.getByTestId('report-checkups').locator('tbody tr')).toHaveCount(4);
  await expect(page.getByTestId('report-print')).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByTestId('report-print')).toBeHidden();
  await expect(page.getByTestId('emergency-button')).toBeHidden();

  await page.emulateMedia({ media: 'screen' });
  await page.goto('/bn/diabetes/report');
  await expect(page.getByTestId('doctor-report')).toContainText('ডাক্তারের জন্য ডায়াবেটিস রিপোর্ট');
});

test('family mode: a second person with separate data; weekly summary shared as text only', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __shared: ShareData[] };
    w.__shared = [];
    Object.defineProperty(navigator, 'share', { configurable: true, value: async (d: ShareData) => void w.__shared.push(d) });
  });
  await onboardDemo(page);
  await seedTwoWeeks(page);
  await page.reload();
  await tab(page, 'more');
  await page.getByTestId('share-summary').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __shared: ShareData[] }).__shared.length)).toBe(1);
  const shared = await page.evaluate(() => (window as unknown as { __shared: ShareData[] }).__shared);
  expect(shared).toHaveLength(1);
  expect(Object.keys(shared[0]!)).toEqual(['text']); // no files, no photos
  expect(shared[0]!.text).toContain('Nirapod weekly summary');
  expect(shared[0]!.text).toContain('Low readings: 1.');

  await page.getByTestId('family').getByText('Add a family member').click();
  await page.getByTestId('person-name').fill('Amma');
  await page.getByTestId('person-add').click();
  await expect(page.getByTestId('diabetes-onboarding')).toBeVisible(); // Amma has her own setup
  await page.getByTestId('onboarding-demo').click();
  await tab(page, 'glucose');
  await expect(page.getByText('No readings yet.')).toBeVisible(); // her data is separate
  await tab(page, 'more');
  await page.getByTestId('person').filter({ hasText: 'Me' }).getByTestId('person-switch').click();
  await tab(page, 'glucose');
  await expect(page.getByTestId('glucose-recent')).toBeVisible();
});

test('trial over: Premium screen (stub) with coming-soon features; sugar entry and low-sugar help stay free', async ({ page }) => {
  await onboardDemo(page);
  await page.evaluate(
    (start) =>
      new Promise<void>((resolve) => {
        const open = indexedDB.open('nirapod');
        open.onsuccess = () => {
          const tx = open.result.transaction('settings', 'readwrite');
          const store = tx.objectStore('settings');
          const get = store.get('settings');
          get.onsuccess = () => store.put({ ...get.result, trialStart: start });
          tx.oncomplete = () => resolve();
        };
      }),
    Date.now() - 50 * DAY,
  );
  await page.reload();
  await expect(page.getByTestId('trial-left')).toHaveText('Free trial: 0 days left');
  await expect(page.getByTestId('premium-screen')).toBeVisible();
  await expect(page.getByTestId('trial-ended')).toBeVisible();
  await expect(page.getByTestId('premium-soon')).toContainText('Ramadan mode');
  await expect(page.getByTestId('premium-soon')).toContainText('Voice guidance in Bangla');
  await expect(page.getByTestId('premium-soon')).toContainText('Online doctor consultation');
  await tab(page, 'glucose');
  await page.getByTestId('glucose-value').fill('3.1');
  await page.getByTestId('glucose-save').click();
  await expect(page.getByTestId('low-glucose-alert')).toBeVisible();
  await expect(page.getByTestId('emergency-button')).toBeVisible();
});

test('medicine reminder appears at the dose time (in-app banner when notifications are off)', async ({ page }) => {
  const start = new Date();
  start.setHours(7, 58, 30, 0);
  await page.clock.install({ time: start });
  await setDemoMode(page);
  await page.goto('/en/diabetes');
  await page.getByTestId('onboarding-demo').click();
  await tab(page, 'medicines');
  await page.getByTestId('add-medicine').locator('summary').click();
  await page.getByTestId('med-brand').fill('Comet');
  await page.getByTestId('med-frequency').fill('1+0+1');
  await page.getByTestId('med-save').click();
  await expect(page.getByTestId('medicine')).toBeVisible();
  await page.clock.fastForward('02:30');
  await expect(page.getByTestId('reminder-banner')).toContainText('Medicine time: Comet (1+0+1)');
});
