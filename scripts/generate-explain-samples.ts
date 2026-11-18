/**
 * Renders the demo-mode sample lab report and prescription (public/samples/). All names, phone numbers and
 * centres on them are fictional. Run: npx tsx scripts/generate-explain-samples.ts
 */
import { chromium } from '@playwright/test';

const REPORT_ROWS = [
  ['Fasting Blood Sugar (FBS)', '7.8', 'mmol/L', '3.9 - 5.6'],
  ['HbA1c', '8.1', '%', '4.0 - 5.6'],
  ['Haemoglobin', '10.2', 'g/dL', '12.0 - 15.5'],
  ['Total Cholesterol', '248', 'mg/dL', '< 200'],
  ['Serum Creatinine', '0.9', 'mg/dL', '0.6 - 1.1'],
  ['SGPT (ALT)', '32', 'U/L', 'Up to 40'],
];

const RX_LINES = [
  'Tab. Comet 500 mg — 1+0+1 — 30 days',
  'Tab. Rosuva 10 mg — 0+0+1 — 30 days',
  'Tab. Clopid 75 mg — 0+1+0 — 30 days',
  'Cap. Seclo 20 mg — 1+0+1 — 14 days',
  'Tab. Napa 500 mg — 1+1+1 — 5 days',
  'Tab. Ace 500 mg — 1+0+1 — 5 days',
];

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 1400 }, deviceScaleFactor: Number(process.env.SAMPLE_SCALE ?? 1) });

  await page.setContent(`<html><body style="margin:0;background:#fff;font-family:Arial,Helvetica,sans-serif;color:#111;padding:56px">
    <div style="font-size:34px;font-weight:700">Sample Diagnostic Centre</div>
    <div style="font-size:20px;margin-top:6px">House 1, Road 1, Dhaka (sample)</div>
    <div style="font-size:22px;margin-top:28px">Patient: Rahima Begum &nbsp;&nbsp; Age: 52 Years &nbsp;&nbsp; Sex: F</div>
    <div style="font-size:22px;margin-top:6px">Date: 12/11/2026 &nbsp;&nbsp; Ref. by: Dr. A. Karim</div>
    <div style="font-size:28px;font-weight:700;margin-top:36px">BIOCHEMISTRY REPORT</div>
    <table style="margin-top:20px;border-collapse:collapse;font-size:26px;width:100%">
      <tr style="font-weight:700;border-bottom:2px solid #111"><td style="padding:10px 0">Test</td><td>Result</td><td>Unit</td><td>Reference Value</td></tr>
      ${REPORT_ROWS.map((r) => `<tr><td style="padding:14px 0">${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td></tr>`).join('')}
    </table>
    <div style="font-size:20px;margin-top:40px">This is a sample report for demonstration.</div>
  </body></html>`);
  await page.screenshot({ path: 'public/samples/lab-report.png' });

  await page.setContent(`<html><body style="margin:0;background:#fbfaf3;color:#111;font-family:Arial,Helvetica,sans-serif;width:1100px;height:1400px">
    <div style="height:300px;padding:40px 56px;box-sizing:border-box;border-bottom:3px solid #1d4e89">
      <div style="font-size:34px;font-weight:700;color:#1d4e89">Dr. Sample Name</div>
      <div style="font-size:20px">MBBS, FCPS (Medicine) — Sample Medical Centre, Dhaka</div>
      <div style="font-size:24px;margin-top:30px">Name: Rahima Begum &nbsp; Age: 52 &nbsp; Mobile: 01712-345678</div>
      <div style="font-size:24px;margin-top:8px">Address: Mirpur 10, Dhaka &nbsp; Date: 12/11/2026</div>
    </div>
    <div style="padding:40px 70px;font-family:'DejaVu Serif',serif;font-style:italic;color:#1a3c8f">
      <div style="font-size:30px">Dx: Type 2 DM, Dyslipidaemia</div>
      <div style="font-size:64px;font-weight:700;margin-top:24px">℞</div>
      ${RX_LINES.map((l, i) => `<div style="font-size:36px;margin-top:30px;transform:rotate(${[-1.2, 0.8, -0.6, 1.1, -0.9, 0.5][i]}deg);margin-left:${[0, 14, 6, 20, 4, 12][i]}px">${l}</div>`).join('')}
    </div>
  </body></html>`);
  await page.screenshot({ path: 'public/samples/prescription.png' });

  await browser.close();
  console.log('explain samples written');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
