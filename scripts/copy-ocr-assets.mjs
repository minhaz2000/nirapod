/**
 * Copies tesseract.js worker, LSTM-only WASM cores and eng + ben language data into public/tesseract/,
 * so printed-text OCR works offline with no CDN. Runs on postinstall; public/tesseract/ is git-ignored.
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkgDir = (name) => dirname(require.resolve(`${name}/package.json`));
const OUT = 'public/tesseract';

const files = [
  [join(pkgDir('tesseract.js'), 'dist/worker.min.js'), 'worker.min.js'],
  ...['lstm', 'simd-lstm', 'relaxedsimd-lstm'].map((v) => [
    join(pkgDir('tesseract.js-core'), `tesseract-core-${v}.wasm.js`),
    `core/tesseract-core-${v}.wasm.js`,
  ]),
  ...['eng', 'ben'].map((l) => [
    join(pkgDir(`@tesseract.js-data/${l}`), `4.0.0_best_int/${l}.traineddata.gz`),
    `lang/${l}.traineddata.gz`,
  ]),
];

for (const [from, to] of files) {
  const target = join(OUT, to);
  mkdirSync(dirname(target), { recursive: true });
  if (!existsSync(from)) throw new Error(`copy-ocr-assets: missing ${from}`);
  copyFileSync(from, target);
}
console.log(`copy-ocr-assets: ${files.length} files → ${OUT}/`);
