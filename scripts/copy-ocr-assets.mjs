/**
 * Copies browser runtime assets out of node_modules so nothing loads from a CDN (works offline). Runs on postinstall;
 * both target folders are git-ignored.
 *  - public/tesseract/: tesseract.js worker, LSTM-only WASM cores, eng + ben language data (printed-text OCR)
 *  - public/ort/<version>/: onnxruntime-web WASM runtime (on-device models). The version in the path lets these
 *    files be cached as immutable.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
/** Package folder; falls back to node_modules/<name> for packages that do not export package.json. */
const pkgDir = (name) => {
  try {
    return dirname(require.resolve(`${name}/package.json`));
  } catch {
    return join(process.cwd(), 'node_modules', name);
  }
};
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

const ortDir = pkgDir('onnxruntime-web');
const ortVersion = JSON.parse(readFileSync(join(ortDir, 'package.json'), 'utf8')).version;
for (const f of ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs']) {
  files.push([join(ortDir, 'dist', f), `../ort/${ortVersion}/${f}`]);
}

for (const [from, to] of files) {
  const target = join(OUT, to);
  mkdirSync(dirname(target), { recursive: true });
  if (!existsSync(from)) throw new Error(`copy-ocr-assets: missing ${from}`);
  copyFileSync(from, target);
}
console.log(`copy-ocr-assets: ${files.length} files → public/tesseract/ and public/ort/${ortVersion}/`);
