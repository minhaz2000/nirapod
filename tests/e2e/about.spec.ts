import { expect, test } from '@playwright/test';

for (const [locale, title, map, products] of [
  ['en', "How Nirapod's AI works", '0.867', '17,589'],
  ['bn', 'নিরাপদের AI কীভাবে কাজ করে', '০.৮৬৭', '১৭,৫৮৯'],
] as const) {
  test(`About (${locale}): AI flow diagram and the three cards, readable at 360 px`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(`/${locale}/about`);
    const section = page.getByTestId('how-ai-works');
    await expect(section.getByRole('heading', { level: 2 })).toHaveText(title);
    const diagram = page.getByTestId('ai-diagram');
    await expect(diagram.locator('[data-step]')).toHaveCount(5);
    await expect(page.getByTestId('ai-accuracy')).toContainText(map);
    await expect(page.getByTestId('ai-medicines')).toContainText(products);
    await expect(page.getByTestId('ai-scale')).toBeVisible();
    await expect(page.getByTestId('ai-safety')).toBeVisible();
    // Every line of the diagram fits inside its box, and the page does not scroll sideways.
    const widest = await diagram.evaluate((svg) =>
      Math.max(...[...svg.querySelectorAll('text')].map((t) => (t as SVGTextElement).getBBox().x + (t as SVGTextElement).getBBox().width)),
    );
    expect(widest).toBeLessThan(318);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    // No emoji anywhere in the section.
    expect(await section.innerText()).not.toMatch(/\p{Extended_Pictographic}/u);
  });
}
