/** Everything read from a medicine-pack photo, in one place. */
import { parseBatch } from './batch';
import { parsePackDates, type PackDates } from './expiry';
import { parsePrice, type PrintedPrice } from './price';
import { parseRegistration } from './registration';
import { normaliseOcrText } from './text';
import type { OcrWord } from './tesseract';

export interface PackReading {
  text: string;
  dates: PackDates;
  batch: string | null;
  price: PrintedPrice | null;
  registration: string | null;
  /** Likely brand names, best first (largest printed words). */
  brandCandidates: string[];
}

const STOP_WORDS = new Set(
  `tablet tablets tab tabs capsule capsules cap caps syrup suspension injection cream ointment drops
   usp bp mg ml mcg gm each film coated contains contain pharmaceuticals pharmaceutical pharma ltd limited plc
   laboratories laboratory industries company bangladesh dhaka gazipur batch lot mfg mfd exp expiry date
   mrp price retail taka reg dar lic licence license store keep below cool dry place away light children reach
   only rx prescription use before best dose dosage see leaf insert manufactured marketed by for the and of in
   with from per strip pack box`.split(/\s+/),
);

/** Picks words that could be a brand: letters only, at least 3 long, not a common pack word. Biggest first. */
export function brandCandidates(words: readonly OcrWord[], text: string, max = 5): string[] {
  const pool =
    words.length > 0
      ? [...words].filter((w) => w.confidence >= 40).sort((a, b) => b.height - a.height).map((w) => w.text)
      : normaliseOcrText(text).split(/\s+/);
  const out: string[] = [];
  for (const raw of pool) {
    const w = raw.replace(/^[^A-Za-z]+|[^A-Za-z0-9]+$/g, '');
    if (w.length < 3 || !/^[A-Za-z][A-Za-z0-9\-]*$/.test(w) || /\d{2,}/.test(w)) continue;
    if (STOP_WORDS.has(w.toLowerCase())) continue;
    if (!out.some((o) => o.toLowerCase() === w.toLowerCase())) out.push(w);
    if (out.length >= max) break;
  }
  return out;
}

export function readPack(text: string, words: readonly OcrWord[] = []): PackReading {
  return {
    text,
    dates: parsePackDates(text),
    batch: parseBatch(text),
    price: parsePrice(text),
    registration: parseRegistration(text),
    brandCandidates: brandCandidates(words, text),
  };
}
