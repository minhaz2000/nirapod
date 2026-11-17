/**
 * Downloads the medicine reference files into data/raw/medicines/ if they are missing.
 * data/raw/ is git-ignored, so this is how CI and Vercel builds get the data.
 * Run: npm run fetch:data
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { MEDICINE_SOURCE } from './medicine-source';

export async function fetchMedicineData({ force = false } = {}): Promise<void> {
  const { rawDir, files, commit } = MEDICINE_SOURCE;
  mkdirSync(rawDir, { recursive: true });
  for (const file of files) {
    const target = join(rawDir, basename(file));
    if (!force && existsSync(target)) continue;
    const url = `https://raw.githubusercontent.com/WSAyan/medicinedb/${commit}/${file}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`fetch-data: ${url} → HTTP ${res.status}`);
    writeFileSync(target, Buffer.from(await res.arrayBuffer()));
    console.log(`fetch-data: downloaded ${file}`);
  }
}

if (process.argv[1] && /fetch-data\.ts$/.test(process.argv[1])) {
  fetchMedicineData({ force: process.argv.includes('--force') }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
