/** Everything read from a medicine-pack photo, in one place. */
import { parseBatch } from './batch';
import { parseDateValue, parsePackDates, type PackDates } from './expiry';
import { parsePrice, type PrintedPrice } from './price';
import { parseRegistration } from './registration';
import { normaliseOcrText } from './text';
import type { OcrLine, OcrWord } from './tesseract';

export interface PackReading {
  text: string;
  dates: PackDates;
  batch: string | null;
  price: PrintedPrice | null;
  registration: string | null;
  /** Likely brand names, best first (largest printed text first; two-word brands such as "No Pain" kept whole). */
  brandCandidates: string[];
  /** Where the text came from: the vision model (verified against the database) or on-phone OCR. */
  source?: 'vision' | 'ocr';
  /** Fields the vision model read (empty when OCR was used). Never trusted on their own. */
  fields?: { generic: string; strength: string; form: string; manufacturer: string };
}

const STOP_WORDS = new Set(
  `tablet tablets tab tabs capsule capsules cap caps syrup suspension injection cream ointment drops
   usp bp mg ml mcg gm each film coated contains contain pharmaceuticals pharmaceutical pharma ltd limited plc
   laboratories laboratory industries company bangladesh dhaka gazipur batch lot mfg mfd exp expiry date
   mrp price retail taka reg dar lic licence license store keep below cool dry place away light children reach
   only rx prescription use before best dose dosage see leaf insert manufactured marketed by for the and of in
   with from per strip pack box`.split(/\s+/),
);

/** Short words that are part of real brands ("No Pain", "Ace", "Max"); kept when next to another word. */
const isWord = (w: string) => /^[A-Za-z][A-Za-z0-9\-]*$/.test(w) && !/\d{2,}/.test(w);
const clean = (raw: string) => raw.replace(/^[^A-Za-z]+|[^A-Za-z0-9]+$/g, '');

/**
 * Brand phrases from one printed line: the whole line (up to 3 words) and adjacent pairs, so a two-word brand
 * ("No Pain") is tried as written and joined ("NoPain" — matched against "Nopain"), plus single words of 3+ letters.
 * Pack words such as "Tablet" or "Ltd" end a phrase.
 */
export function phrasesFromLine(line: string): string[] {
  const out: string[] = [];
  const runs: string[][] = [[]];
  for (const raw of line.split(/\s+/)) {
    const w = clean(raw);
    if (!w || !isWord(w) || STOP_WORDS.has(w.toLowerCase())) {
      if (runs.at(-1)!.length) runs.push([]);
      continue;
    }
    runs.at(-1)!.push(w);
  }
  for (const run of runs) {
    if (!run.length) continue;
    if (run.length >= 2 && run.length <= 3) out.push(run.join(' '));
    for (let i = 0; i + 1 < run.length; i++) out.push(`${run[i]} ${run[i + 1]}`);
    for (const w of run) if (w.length >= 3) out.push(w);
  }
  return [...new Set(out)];
}

/** Brand candidates: lines by printed size (largest first), each split into phrases. */
export function brandCandidates(words: readonly OcrWord[], text: string, max = 8, lines: readonly OcrLine[] = []): string[] {
  let source: string[];
  if (lines.length) {
    source = [...lines].filter((l) => l.confidence >= 30).sort((a, b) => b.height - a.height).map((l) => l.text);
  } else if (words.length) {
    source = [...words].filter((w) => w.confidence >= 40).sort((a, b) => b.height - a.height).map((w) => w.text);
  } else {
    source = normaliseOcrText(text).split('\n');
  }
  const out: string[] = [];
  for (const line of source) {
    for (const p of phrasesFromLine(line)) {
      if (!out.some((o) => o.toLowerCase() === p.toLowerCase())) out.push(p);
      if (out.length >= max) return out;
    }
  }
  return out;
}

export function readPack(text: string, words: readonly OcrWord[] = [], lines: readonly OcrLine[] = []): PackReading {
  return {
    text,
    dates: parsePackDates(text),
    batch: parseBatch(text),
    price: parsePrice(text),
    registration: parseRegistration(text),
    brandCandidates: brandCandidates(words, text, 8, lines),
    source: 'ocr',
  };
}

/** Fields read by the vision model (see app/api/pack/read). */
export interface VisionPackFields {
  brand: string;
  generic: string;
  strength: string;
  dosage_form: string;
  manufacturer: string;
  expiry_date: string;
  manufacturing_date: string;
  batch_number: string;
  dar_number: string;
  visible_text: string;
}

/**
 * A reading from the vision model's answer. Dates come from the labelled text first ("EXP 08/2027" in the
 * transcription), then from the labelled fields; an unlabelled date is never taken as the expiry.
 */
export function readingFromVision(f: VisionPackFields): PackReading {
  const text = f.visible_text || [f.brand, f.generic, f.strength, f.dosage_form, f.manufacturer].filter(Boolean).join('\n');
  const fromText = parsePackDates(text);
  const exp = fromText.exp ?? parseDateValue(f.expiry_date, 'exp') ?? undefined;
  const mfg = fromText.mfg ?? parseDateValue(f.manufacturing_date, 'mfg') ?? undefined;
  const brands = [f.brand, ...brandCandidates([], text, 8)].filter(Boolean);
  return {
    text,
    dates: { ...(mfg ? { mfg } : {}), ...(exp ? { exp } : {}) },
    batch: f.batch_number || parseBatch(text),
    price: parsePrice(text),
    registration: f.dar_number || parseRegistration(text),
    brandCandidates: brands.filter((b, i) => brands.findIndex((x) => x.toLowerCase() === b.toLowerCase()) === i),
    source: 'vision',
    fields: { generic: f.generic, strength: f.strength, form: f.dosage_form, manufacturer: f.manufacturer },
  };
}

/**
 * Adds the back / side of the pack to the front reading. Each date keeps its own label (MFG never becomes EXP);
 * the front's values win where both sides have one, and the brand phrases of the front stay first.
 */
export function mergeReadings(front: PackReading, back: PackReading): PackReading {
  const brands = [...front.brandCandidates, ...back.brandCandidates];
  const pick = <T>(a: T | null | undefined, b: T | null | undefined) => (a ?? b ?? null) as T | null;
  const fields =
    front.fields || back.fields
      ? {
          generic: front.fields?.generic || back.fields?.generic || '',
          strength: front.fields?.strength || back.fields?.strength || '',
          form: front.fields?.form || back.fields?.form || '',
          manufacturer: front.fields?.manufacturer || back.fields?.manufacturer || '',
        }
      : undefined;
  const exp = front.dates.exp ?? back.dates.exp;
  const mfg = front.dates.mfg ?? back.dates.mfg;
  return {
    text: `${front.text}\n${back.text}`,
    dates: { ...(mfg ? { mfg } : {}), ...(exp ? { exp } : {}) },
    batch: pick(front.batch, back.batch),
    price: pick(front.price, back.price),
    registration: pick(front.registration, back.registration),
    brandCandidates: brands.filter((b, i) => brands.findIndex((x) => x.toLowerCase() === b.toLowerCase()) === i).slice(0, 12),
    source: front.source === 'vision' || back.source === 'vision' ? 'vision' : 'ocr',
    fields,
  };
}

/** What the server needs to identify the medicine (no dates, batch or price). */
export function evidenceFromReading(r: PackReading): {
  source: 'vision' | 'ocr';
  brandTexts: string[];
  generic?: string;
  strength?: string;
  form?: string;
  manufacturer?: string;
  text: string;
} {
  return {
    source: r.source ?? 'ocr',
    brandTexts: r.brandCandidates,
    ...(r.fields?.generic ? { generic: r.fields.generic } : {}),
    ...(r.fields?.strength ? { strength: r.fields.strength } : {}),
    ...(r.fields?.form ? { form: r.fields.form } : {}),
    ...(r.fields?.manufacturer ? { manufacturer: r.fields.manufacturer } : {}),
    text: r.text,
  };
}

const PACK_WORDS = /\b(?:tab(?:let)?s?|cap(?:sule)?s?|syrup|suspension|injection|drops?|cream|ointment|gel|mg|mcg|ml|bp|usp|exp|expiry|mfg|mfd|batch|lot|ltd|limited|pharma\w*|laborator\w*|dar|mrp)\b/i;

/**
 * Did on-phone OCR read anything useful? A shiny foil strip or a blurred photo often gives a few random letters.
 * Useful = at least 2 words of 3+ letters plus a typical pack word (Tablet, mg, EXP, Ltd …), or 6+ word-like words.
 */
export function isUsefulPackText(text: string): boolean {
  const words = normaliseOcrText(text)
    .split(/\s+/)
    .map((w) => w.replace(/[^A-Za-z]/g, ''))
    .filter((w) => w.length >= 3);
  if (words.length < 2) return false;
  return PACK_WORDS.test(normaliseOcrText(text)) || (words.length >= 6 && words.filter((w) => /[aeiouy]/i.test(w)).length >= 4);
}
