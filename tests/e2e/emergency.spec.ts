import { expect, test } from '@playwright/test';

const DHAKA = { latitude: 23.810331, longitude: 90.412521 };

test.use({ geolocation: DHAKA, permissions: ['geolocation', 'clipboard-read', 'clipboard-write'] });

test('Call 999 is one tap on the emergency page, before any selection', async ({ page }) => {
  await page.goto('/en/emergency');
  await expect(page.getByTestId('call-999')).toHaveAttribute('href', 'tel:999');
  await expect(page.getByText(/police, fire service and ambulance providers/)).toBeVisible();
  await expect(page.getByTestId('emergency-alert')).toHaveCount(0);
});

test('selecting a danger sign opens the full-screen alert (English)', async ({ page }) => {
  await page.goto('/en/emergency');
  await page.getByTestId('sign-strokeFace').click();

  const alert = page.getByTestId('emergency-alert');
  await expect(alert).toBeVisible();
  await expect(alert.getByRole('heading', { level: 2 })).toHaveText(/Possible emergency — call 999 now/);
  await expect(page.getByTestId('alert-call-999')).toHaveAttribute('href', 'tel:999');
  await expect(page.getByTestId('alert-signs')).toContainText('Face drooping');
  await expect(page.getByTestId('alert-advice')).toContainText('Note the time');

  // full screen: covers the viewport
  const box = await alert.boundingBox();
  const vp = page.viewportSize()!;
  expect(box).toMatchObject({ x: 0, y: 0, width: vp.width, height: vp.height });

  // close → back to checklist, selection kept, can re-open
  await page.getByTestId('alert-close').click();
  await expect(alert).toHaveCount(0);
  await expect(page.getByTestId('sign-strokeFace')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('alert-reopen').click();
  await expect(alert).toBeVisible();
});

test('Bangla: alert, 999 explanation and hospitals', async ({ page }) => {
  await page.goto('/bn/emergency');
  await page.getByTestId('sign-chestPain').click();
  const alert = page.getByTestId('emergency-alert');
  await expect(alert.getByRole('heading', { level: 2 })).toHaveText(/এখনই ৯৯৯-এ ফোন করুন/);
  await expect(alert).toContainText('পুলিশ, ফায়ার সার্ভিস ও অ্যাম্বুলেন্স');
  await expect(page.getByTestId('alert-nearby-hospitals')).toHaveAttribute('href', /maps.*hospital/);
});

test('share my location uses the share sheet and centres hospitals on the user', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __shared: ShareData[] };
    w.__shared = [];
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data: ShareData) => {
        w.__shared.push(data);
      },
    });
  });
  await page.goto('/en/emergency');
  await page.getByTestId('sign-breathing').click();
  await page.getByTestId('alert-share-location').click();

  await expect(page.getByTestId('alert-location-link')).toHaveAttribute('href', /query=23\.81033,90\.41252/);
  const shared = await page.evaluate(() => (window as unknown as { __shared: ShareData[] }).__shared);
  expect(shared).toHaveLength(1);
  expect(shared[0]!.url).toContain('23.81033,90.41252');
  await expect(page.getByTestId('alert-nearby-hospitals')).toHaveAttribute(
    'href',
    'https://www.google.com/maps/search/hospitals/@23.81033,90.41252,14z',
  );
});

test('without a share sheet, the location link is copied', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
  });
  await page.goto('/en/emergency');
  await page.getByTestId('share-location').click();
  await expect(page.getByTestId('link-copied')).toBeVisible();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toContain('I need help. My location:');
  expect(clip).toContain('23.81033,90.41252');
});

test('other modules can route here with signs pre-selected (low glucose → take something sweet)', async ({ page }) => {
  await page.goto('/en/emergency?signs=lowGlucose');
  const alert = page.getByTestId('emergency-alert');
  await expect(alert).toBeVisible();
  await expect(page.getByTestId('alert-signs')).toContainText('Blood sugar below 3.9 mmol/L (70 mg/dL)');
  await expect(page.getByTestId('alert-advice')).toContainText('give something sweet now');
});

test('unknown signs in the URL are ignored', async ({ page }) => {
  await page.goto('/en/emergency?signs=notASign');
  await expect(page.getByTestId('call-999')).toBeVisible();
  await expect(page.getByTestId('emergency-alert')).toHaveCount(0);
});
