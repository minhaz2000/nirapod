/**
 * Batch / lot number, e.g. "Batch No.: 2405123", "B. No. MN24012", "B.N. 23K045", "Lot: 24A12", "ব্যাচ নং: ২৪০৫১২৩".
 * Returns the upper-cased code, or null. A batch code must contain at least one digit.
 */
import { normaliseOcrText } from './text';

const BATCH = new RegExp(
  String.raw`(?:\bbatch(?:\s*(?:no|number|#))?|\bb\s*\.?\s*no|\bb\s*\.\s*n\b\.?|\bb\/n|\blot(?:\s*(?:no|number|#))?|ব্যাচ(?:\s*(?:নং|নম্বর))?)` +
    String.raw`[\s.:#\-]*(?<code>[A-Za-z0-9][A-Za-z0-9\-\/]{1,15})`,
  'i',
);

const NOT_A_CODE = /^(?:no|number|date|mfg|exp)$/i;

export function parseBatch(raw: string): string | null {
  const text = normaliseOcrText(raw);
  for (const line of text.split('\n')) {
    const m = line.match(BATCH);
    const code = m?.groups?.code?.replace(/[\-\/]+$/, '');
    if (code && /\d/.test(code) && !NOT_A_CODE.test(code)) return code.toUpperCase();
  }
  return null;
}
