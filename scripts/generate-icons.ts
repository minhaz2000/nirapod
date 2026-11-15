/**
 * Renders public/icons/icon.svg into the PNG sizes used by the PWA manifest.
 * Run: npx tsx scripts/generate-icons.ts
 */
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const svg = readFileSync('public/icons/icon.svg', 'utf8');

async function render(size: number, out: string, padding = 0) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  const inner = size - padding * 2;
  await page.setContent(
    `<html><body style="margin:0;background:#115e59;display:grid;place-items:center;width:${size}px;height:${size}px">
      <div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div>
    </body></html>`,
  );
  await page.screenshot({ path: out, omitBackground: padding === 0 });
  await browser.close();
}

async function main() {
  await render(192, 'public/icons/icon-192.png');
  await render(512, 'public/icons/icon-512.png');
  await render(512, 'public/icons/icon-maskable-512.png', 64);
  console.log('icons written');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
