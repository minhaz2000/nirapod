/**
 * Renders the demo-mode sample medicine-pack photos (public/samples/*.png). Plain text labels for demos/tests,
 * slightly rotated so the straightening step has something to do.
 * Run: npx tsx scripts/generate-sample-packs.ts
 */
import { chromium } from '@playwright/test';

const PACKS = {
  'medicine-pack-ok': {
    rotate: 3,
    lines: [
      'Paracetamol BP 500 mg Tablet',
      'Beximco Pharmaceuticals Ltd.',
      'Batch No.: 2405123',
      'Mfg. Date: 05/2025   Exp. Date: 04/2028',
      'MRP Tk. 1.20 per Tablet',
      'DAR No. 037-0123-045',
    ],
  },
  'medicine-pack-check': {
    rotate: -2,
    lines: [
      'Paracetamol BP 500 mg Tablet',
      'Beximko Pharmaceuticals Ltd.',
      'Mfg. Date: 06/2025   Exp. Date: 01/2024',
      'MRP Tk. 0.30 per Tablet',
      'DAR No. 037-0123-045',
    ],
  },
};

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1 });
  for (const [name, pack] of Object.entries(PACKS)) {
    await page.setContent(`
      <html><body style="margin:0;background:#8d8a83;display:grid;place-items:center;height:900px;font-family:Arial,Helvetica,sans-serif">
        <div style="transform:rotate(${pack.rotate}deg);background:#fdfdf8;width:960px;padding:48px 56px;border-radius:8px;
                    box-shadow:0 12px 40px rgba(0,0,0,.35);border-top:28px solid #c62828;color:#111">
          <div style="font-size:110px;font-weight:800;letter-spacing:2px;color:#b71c1c;line-height:1">Napa</div>
          ${pack.lines.map((l, i) => `<div style="font-size:${i < 2 ? 40 : 34}px;margin-top:${i === 2 ? 28 : 10}px;font-weight:${i < 2 ? 700 : 500}">${l}</div>`).join('')}
        </div>
      </body></html>`);
    await page.screenshot({ path: `public/samples/${name}.png` });
  }
  await browser.close();
  console.log('sample packs written');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
