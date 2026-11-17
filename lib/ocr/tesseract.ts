/**
 * Printed-text OCR with tesseract.js in the browser (eng + ben), fully self-hosted under /tesseract/
 * (copied by scripts/copy-ocr-assets.mjs) so it works offline. Images are never uploaded.
 */
import type { Worker } from 'tesseract.js';

export interface OcrWord {
  text: string;
  confidence: number;
  /** Height of the word's box in px — the brand name is usually the biggest text on a pack. */
  height: number;
}

export interface OcrResult {
  text: string;
  words: OcrWord[];
  confidence: number;
}

let workerPromise: Promise<Worker> | null = null;

function getWorker(onProgress?: (p: number) => void): Promise<Worker> {
  workerPromise ??= (async () => {
    const { createWorker, OEM, PSM } = await import('tesseract.js');
    const worker = await createWorker(['eng', 'ben'], OEM.LSTM_ONLY, {
      workerPath: '/tesseract/worker.min.js',
      corePath: '/tesseract/core',
      langPath: '/tesseract/lang',
      gzip: true,
      workerBlobURL: false,
      logger: (m) => {
        if (m.status === 'recognizing text') onProgressRef.current?.(m.progress);
      },
    });
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, preserve_interword_spaces: '1' });
    return worker;
  })().catch((err) => {
    workerPromise = null;
    throw err;
  });
  onProgressRef.current = onProgress;
  return workerPromise;
}

const onProgressRef: { current?: (p: number) => void } = {};

export async function recognisePrinted(
  image: HTMLCanvasElement | Blob | string,
  onProgress?: (progress: number) => void,
): Promise<OcrResult> {
  const worker = await getWorker(onProgress);
  onProgressRef.current = onProgress;
  const { data } = await worker.recognize(image, {}, { text: true, blocks: true });
  const words: OcrWord[] = [];
  for (const block of data.blocks ?? []) {
    for (const para of block.paragraphs) {
      for (const line of para.lines) {
        for (const w of line.words) {
          words.push({ text: w.text, confidence: w.confidence, height: w.bbox.y1 - w.bbox.y0 });
        }
      }
    }
  }
  return { text: data.text, words, confidence: data.confidence };
}

export async function terminateOcr(): Promise<void> {
  if (!workerPromise) return;
  const w = await workerPromise.catch(() => null);
  workerPromise = null;
  await w?.terminate();
}
