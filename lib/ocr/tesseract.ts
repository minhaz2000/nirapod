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

/** One printed line with the height of its tallest word (brands are usually the biggest line on a pack). */
export interface OcrLine {
  text: string;
  height: number;
  confidence: number;
}

export interface OcrResult {
  text: string;
  words: OcrWord[];
  lines: OcrLine[];
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

/**
 * 'sparse' (default) finds scattered text such as a medicine pack; 'table' keeps whole rows together, which a lab
 * report needs ("Test  Result  Unit  Range" on one line).
 */
export type OcrLayout = 'sparse' | 'table';

export async function recognisePrinted(
  image: HTMLCanvasElement | Blob | string,
  onProgress?: (progress: number) => void,
  layout: OcrLayout = 'sparse',
): Promise<OcrResult> {
  const worker = await getWorker(onProgress);
  onProgressRef.current = onProgress;
  const { PSM } = await import('tesseract.js');
  await worker.setParameters({ tessedit_pageseg_mode: layout === 'table' ? PSM.SINGLE_BLOCK : PSM.SPARSE_TEXT });
  const { data } = await worker.recognize(image, {}, { text: true, blocks: true });
  const words: OcrWord[] = [];
  const lines: OcrLine[] = [];
  for (const block of data.blocks ?? []) {
    for (const para of block.paragraphs) {
      for (const line of para.lines) {
        const lineWords = line.words.map((w) => ({ text: w.text, confidence: w.confidence, height: w.bbox.y1 - w.bbox.y0 }));
        words.push(...lineWords);
        const text = lineWords.map((w) => w.text).join(' ').trim();
        if (text) lines.push({ text, height: Math.max(0, ...lineWords.map((w) => w.height)), confidence: line.confidence });
      }
    }
  }
  return { text: data.text, words, lines, confidence: data.confidence };
}

export async function terminateOcr(): Promise<void> {
  if (!workerPromise) return;
  const w = await workerPromise.catch(() => null);
  workerPromise = null;
  await w?.terminate();
}
