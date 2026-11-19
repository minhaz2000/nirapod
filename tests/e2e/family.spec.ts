/**
 * Family Plan preview (Premium idea): UI only. Every card opens a two-phone mock-up that is clearly labelled
 * "not live yet"; nothing collects sign-ups or contact details, and the price button is disabled.
 */
import { expect, test, type Page } from '@playwright/test';
import { onboardDemo } from './helpers';

const IDS = ['checkin', 'voice', 'remote', 'refill', 'emergency', 'plate', 'visit', 'story'];
const TEXT = {
  en: { title: 'Family Plan', label: 'Preview — sample, not live yet', progress: 'In progress', soon: 'Coming soon', parent: "Parent's phone", child: "Child's phone" },
  bn: { title: 'পরিবার প্ল্যান', label: 'প্রিভিউ — নমুনা, এখনো চালু হয়নি', progress: 'কাজ চলছে', soon: 'শীঘ্রই আসছে', parent: 'বাবা-মায়ের ফোন', child: 'সন্তানের ফোন' },
} as const;

async function noHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
}

for (const locale of ['en', 'bn'] as const) {
  test(`${locale}: every card opens its preview with the "not live yet" label`, async ({ page }) => {
    const x = TEXT[locale];
    await page.goto(`/${locale}/family`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(x.title);
    await noHorizontalScroll(page);

    const cards = page.locator('[data-testid^="family-card-"]');
    await expect(cards).toHaveCount(8);
    for (const [i, id] of IDS.entries()) {
      const card = page.getByTestId(`family-card-${id}`);
      await expect(card.getByTestId('family-status')).toHaveText([1, 2, 3, 5].includes(i + 1) ? x.progress : x.soon);
      expect((await card.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await expect(card.locator('svg')).toHaveCount(1); // inline SVG icon

      await card.click();
      const sheet = page.getByTestId('family-sheet');
      await expect(sheet).toBeVisible();
      await expect(sheet.getByTestId('not-live-label')).toHaveText(x.label);
      await expect(sheet.getByTestId('not-live-label')).toBeInViewport();
      await expect(sheet.getByTestId(`preview-${id}`)).toBeVisible();
      for (const who of ['parent', 'child'] as const) {
        const phone = sheet.getByTestId(`phone-${who}`);
        await expect(phone).toContainText(who === 'parent' ? x.parent : x.child);
        await expect(phone).toContainText(x.label);
      }
      // Mock-ups contain no real controls.
      await expect(sheet.getByTestId(`preview-${id}`).locator('button, input, a, select, textarea')).toHaveCount(0);
      await noHorizontalScroll(page);
      const close = sheet.getByTestId('family-sheet-close');
      const box = (await close.boundingBox())!;
      expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
      await close.click();
      await expect(sheet).toHaveCount(0);
    }
  });
}

test('page: headline, privacy box, planned price, disabled "Coming soon", no sign-up form', async ({ page }) => {
  await page.goto('/en/family');
  await expect(page.getByTestId('family-headline')).toHaveText("Stay close to your parents' health, even from far away.");
  await expect(page.getByTestId('family-privacy')).toContainText(
    "Family sharing will be opt-in by the parent and end-to-end encrypted. Free users' data never leaves the phone. Skin photos are never shared.",
  );
  await expect(page.getByTestId('family-price')).toContainText('Planned price: about BDT 99–149 per month');
  await expect(page.getByTestId('family-price')).toContainText('Not available yet');
  await expect(page.getByTestId('family-coming-soon')).toBeDisabled();
  await expect(page.getByTestId('family-plan').locator('input, form, textarea')).toHaveCount(0);
  await expect(page.getByTestId('emergency-button').first()).toBeVisible(); // rule 11
});

test('at 360 px the two phones stack and nothing scrolls sideways', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/bn/family');
  await noHorizontalScroll(page);
  await page.getByTestId('family-card-emergency').click();
  const parent = (await page.getByTestId('phone-parent').boundingBox())!;
  const child = (await page.getByTestId('phone-child').boundingBox())!;
  expect(child.y).toBeGreaterThanOrEqual(parent.y + parent.height - 1);
  expect(parent.width).toBeLessThanOrEqual(360);
  await noHorizontalScroll(page);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('family-sheet')).toHaveCount(0);
});

test('reachable from the home card, the About page and the More tab', async ({ page }) => {
  await page.goto('/en');
  await expect(page.getByTestId('home-family-card')).toContainText('For children who live away from their parents — Family Plan, coming soon');
  await page.getByTestId('home-family-card').click();
  await expect(page).toHaveURL(/\/en\/family$/);

  await page.goto('/bn/about');
  await expect(page.getByTestId('about-family')).toContainText('পরিবার প্ল্যান');
  await page.goto('/en/about');
  await expect(page.getByTestId('about-family')).toContainText('not live yet');
  await page.getByTestId('about-family').getByRole('link').click();
  await expect(page).toHaveURL(/\/en\/family$/);

  await onboardDemo(page);
  await page.getByTestId('tab-more').click();
  await page.getByTestId('more-family-link').click();
  await expect(page).toHaveURL(/\/en\/family$/);
});
