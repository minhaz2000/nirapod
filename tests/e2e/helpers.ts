import { expect, type Page } from '@playwright/test';

export async function setDemoMode(page: Page) {
  await page.goto('/en/settings');
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
  await page.getByTestId('demo-mode').check();
  await expect(page.getByTestId('demo-mode')).toBeChecked();
  // Wait until the setting is stored in IndexedDB (navigating straight away can lose the write under load).
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<boolean>((resolve) => {
            const open = indexedDB.open('nirapod');
            open.onsuccess = () => {
              const db = open.result;
              const names = Array.from(db.objectStoreNames);
              if (!names.includes('settings')) return resolve(false);
              const req = db.transaction('settings').objectStore('settings').getAll();
              req.onsuccess = () => {
                db.close();
                resolve((req.result as { demoMode?: boolean }[]).some((r) => r.demoMode === true));
              };
              req.onerror = () => resolve(false);
            };
            open.onerror = () => resolve(false);
          }),
      ),
    )
    .toBe(true);
}

/** Completes Diabetes Companion onboarding with the demo profile (fasting 8.4 mmol/L, HbA1c 7.6 % → fair). */
export async function onboardDemo(page: Page, locale = 'en') {
  await setDemoMode(page);
  await page.goto(`/${locale}/diabetes`);
  await page.getByTestId('onboarding-demo').click();
  await expect(page.getByTestId('diabetes-app')).toBeVisible();
}

/** Writes records straight into the app's IndexedDB (for patterns that need many readings). */
export async function seedIndexedDb(page: Page, store: string, rows: unknown[]) {
  await page.evaluate(
    ({ store, rows }) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('nirapod');
        open.onsuccess = () => {
          const tx = open.result.transaction(store, 'readwrite');
          for (const r of rows) tx.objectStore(store).add(r);
          tx.oncomplete = () => {
            open.result.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
        open.onerror = () => reject(open.error);
      }),
    { store, rows },
  );
}
