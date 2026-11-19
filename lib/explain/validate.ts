/**
 * Output check for AI explanations (rule 8). The AI text is rejected — and the template shown instead — if it:
 *  - names a medicine that is not in the input (checked against the medicine database's brand and generic names),
 *  - contains a number that is not in the input,
 *  - gives dose advice or tells the user to stop / start / change a medicine (rule 3),
 *  - states a diagnosis ("you have diabetes") (rule 1), or is empty / too long.
 */
import { nameKey } from '@/lib/medicine/normalise';
import { toAsciiDigits } from '@/lib/ocr/text';
import type { ExplainInput } from './input';

export type ValidationResult = { ok: true } | { ok: false; reason: 'empty' | 'tooLong' | 'unknownMedicine' | 'unknownNumber' | 'doseAdvice' | 'diagnosis'; detail?: string };

/** Numbers in a text (Bangla digits included), as numeric values. List markers ("1." at line start) are ignored. */
export function numbersIn(text: string): number[] {
  const t = toAsciiDigits(text).replace(/^\s*\d+[.)]\s+/gm, '');
  return [...t.matchAll(/\d+(?:,\d{2,3})*(?:\.\d+)?/g)].map((m) => Number(m[0].replace(/,/g, ''))).filter(Number.isFinite);
}

function ngrams(words: string[], maxN = 3): string[] {
  const out: string[] = [];
  for (let n = 1; n <= maxN; n++) for (let i = 0; i + n <= words.length; i++) out.push(words.slice(i, i + n).join(' '));
  return out;
}

/** Safe phrases that mention stopping are removed before the dose-advice patterns run. */
export const SAFE_PHRASES = [
  /\b(?:do not|don't|never|please do not)\s+(?:stop|change|start)\b[^.!?\n]*/gi,
  /নিজে থেকে[^।.!?\n]*(?:করবেন না)/g,
  /বন্ধ\s*(?:বা\s*পরিবর্তন\s*)?করবেন না/g,
];

export const DOSE_ADVICE = [
  /\b(?:stop|discontinue|quit|pause)\s+(?:taking|using|the|your|this|these|it|them|all)\b/i,
  /\b(?:increase|decrease|reduce|lower|raise|halve|skip|cut|adjust|change)\b[^.!?\n]{0,40}\b(?:dose|doses|dosage|tablets?|capsules?|insulin|units?|mg)\b/i,
  // "double the dose" is advice; "may mean a double dose" is a warning and is allowed
  /\bdouble\s+(?:the|your|their|his|her|its)\s+(?:dose|dosage|tablets?|insulin)\b/i,
  /\b(?:take|use|give)\s+(?:\w+\s+){0,2}(?:tablets?|capsules?|mg|units?|times|teaspoons?|spoons?)\b/i,
  /\b(?:start|begin)\s+(?:taking|using)\b/i,
  /\b(?:switch|change)\s+to\b/i,
  /ডোজ\s*(?:বাড়া|বাড়ি|কমা|পরিবর্তন|দ্বিগুণ)/,
  /(?:বন্ধ\s*করুন|বন্ধ\s*করে\s*দিন|খাওয়া\s*বন্ধ\s*কর(?!বেন না))/,
  /(?:বেশি|কম)\s*করে\s*খান/,
  /(?:শুরু\s*করুন|খাওয়া\s*শুরু)/,
];

export const DIAGNOSIS = [
  /\byou (?:have|are suffering from|definitely have)\s+(?:diabetes|anaemia|anemia|cancer|kidney|liver|heart|hypertension|high blood pressure|an? infection|thyroid|scabies)/i,
  /আপনার\s+(?:ডায়াবেটিস|রক্তস্বল্পতা|ক্যান্সার|কিডনি রোগ|হৃদরোগ|উচ্চ রক্তচাপ|সংক্রমণ)\s+(?:আছে|হয়েছে)/,
];

export interface ValidateOptions {
  /** Medicine names known to the database (nameKey form, 1–3 words). */
  dictionary: ReadonlySet<string>;
  /** Extra text whose words and numbers are allowed (the template explanation). */
  allowedText?: string;
  maxLength?: number;
}

export function validateExplanation(output: string, input: ExplainInput, opts: ValidateOptions): ValidationResult {
  const text = output.trim();
  if (!text) return { ok: false, reason: 'empty' };
  if (text.length > (opts.maxLength ?? 3000)) return { ok: false, reason: 'tooLong' };

  // 1. Medicine names must come from the input.
  const inputText = JSON.stringify(input);
  const allowed = new Set<string>();
  for (const source of [inputText, opts.allowedText ?? '']) for (const g of ngrams(nameKey(source).split(' ').filter(Boolean))) allowed.add(g);
  for (const g of ngrams(nameKey(text).split(' ').filter(Boolean))) {
    if (opts.dictionary.has(g) && !allowed.has(g)) return { ok: false, reason: 'unknownMedicine', detail: g };
  }

  // 2. Every number must appear in the input (999 only with a low-sugar emergency).
  const allowedNumbers = new Set([...numbersIn(inputText), ...numbersIn(opts.allowedText ?? '')]);
  if (!input.lowGlucoseEmergency) allowedNumbers.delete(999);
  for (const n of numbersIn(text)) if (!allowedNumbers.has(n)) return { ok: false, reason: 'unknownNumber', detail: String(n) };

  // 3. No dose advice, no stop/start/change instructions (the "do not stop on your own" phrase is allowed).
  const withoutSafe = SAFE_PHRASES.reduce((acc, re) => acc.replace(re, ' '), text);
  for (const re of DOSE_ADVICE) if (re.test(withoutSafe)) return { ok: false, reason: 'doseAdvice', detail: withoutSafe.match(re)?.[0] };

  // 4. No diagnosis statements.
  for (const re of DIAGNOSIS) if (re.test(text)) return { ok: false, reason: 'diagnosis' };

  return { ok: true };
}
