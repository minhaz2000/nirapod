/**
 * Deterministic medicine rules.
 *
 * Suspicious signs on a pack are things for the user to check — NEVER a verdict. The UI says
 * "N suspicious signs found: …" or "No suspicious signs found" and never calls a medicine fake or genuine
 * (safety rule 2), and never tells anyone to stop or start a medicine (safety rule 3).
 */
import { MEDICINE_CHECKS } from '@/config/medicine-checks';
import { editDistance, foldOcrConfusions, maxTypos } from '@/lib/medicine/fuzzy';
import { nameKey } from '@/lib/medicine/normalise';
import { EXPIRY } from '@/config/expiry';
import { compareDates, expiryEndDate, formatPackDate, parseDateValue, parsePackDates, type PackDates } from '@/lib/ocr/expiry';

// ---------------------------------------------------------------------------------------------------------------
// Duplicate generics (e.g. Napa + Ace are both paracetamol)

export interface MedicineItem {
  brand: string;
  generic: string;
  strength: string;
  dosageForm: string;
}

/** Returns generic names that appear more than once in the list (case-insensitive). */
export function findDuplicateGenerics(items: MedicineItem[]): string[] {
  const seen = new Map<string, number>();
  for (const item of items) {
    const key = item.generic.trim().toLowerCase();
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return [...seen.entries()].filter(([, n]) => n > 1).map(([g]) => g);
}

// ---------------------------------------------------------------------------------------------------------------
// Suspicious signs on a medicine pack

export type SuspiciousSign =
  | { code: 'brandSpelling'; printed: string; expected: string }
  | { code: 'manufacturerSpelling'; printed: string; expected: string }
  | { code: 'missingBatch' }
  | { code: 'missingExpiry' }
  | { code: 'expiryBeforeManufacture'; mfg: string; exp: string }
  | { code: 'expired'; exp: string }
  | { code: 'priceFarBelow'; printedUnitPrice: number; databaseUnitPrice: number };

export interface PackCheckInput {
  /** Full OCR text of the pack. */
  text: string;
  batch: string | null;
  dates: PackDates;
  /** Printed price per tablet/capsule/piece, when the pack says what the price covers. */
  printedUnitPrice: number | null;
  /** The product the user confirmed from the database. */
  product: { brand: string; manufacturer: string | null; unitPrice: number | null };
  today: Date;
}

const COMPANY_SUFFIXES =
  /\b(?:pharmaceuticals?|pharma|ltd|limited|plc|laboratories|laboratory|labs?|industries|company|co|inc|bangladesh|bd|healthcare|health care|drugs?|chemicals?)\b/g;

/** "Beximco Pharmaceuticals Ltd." → "beximco"; "The ACME Laboratories Ltd." → "the acme". */
export function manufacturerCore(name: string): string {
  return nameKey(name).replace(COMPANY_SUFFIXES, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Finds the run of words in the OCR text closest to `target` (same number of words), after undoing common
 * OCR confusions. Returns the printed words and their edit distance, or null if the text is empty.
 */
export function closestPrintedText(text: string, target: string): { printed: string; distance: number } | null {
  const targetKey = nameKey(target);
  if (!targetKey) return null;
  const n = targetKey.split(' ').length;
  const words = text.split(/\s+/).filter((w) => nameKey(w));
  let best: { printed: string; distance: number } | null = null;
  // Same number of words, and one more word joined without spaces: "No Pain" printed for the brand "Nopain" is the
  // same name (spacing only), never a spelling difference.
  for (const size of [n, n + 1]) {
    for (let i = 0; i + size <= words.length; i++) {
      const printed = words.slice(i, i + size).join(' ').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
      // Compare as printed and with OCR confusions undone (on both sides: "International" contains "rn").
      const raw = nameKey(printed);
      const distance = Math.min(
        ...[[raw, targetKey] as const, [foldOcrConfusions(raw), foldOcrConfusions(targetKey)] as const].flatMap(([k, tk]) => [
          ...(size === n ? [editDistance(k, tk)] : []),
          editDistance(k.replace(/ /g, ''), tk.replace(/ /g, '')),
        ]),
      );
      if (!best || distance < best.distance) best = { printed, distance };
      if (distance === 0) return best;
    }
  }
  return best;
}

/**
 * Spelling mismatch: printed name is close to, but not the same as, the database name (1..maxTypos edits).
 * Exact matches and OCR misreads (rn/m, 0/o, 1/l) are not signs; a completely different word cannot be compared.
 */
function spellingSign(text: string, expected: string, expectedKey: string) {
  if (expectedKey.length < 4) return null; // too short to judge a typo
  const found = closestPrintedText(text, expectedKey);
  if (!found || found.distance === 0 || found.distance > maxTypos(expectedKey.length)) return null;
  return { printed: found.printed, expected };
}

export function checkBrandSpelling(text: string, brand: string): SuspiciousSign | null {
  const s = spellingSign(text, brand, nameKey(brand));
  return s && { code: 'brandSpelling', ...s };
}

export function checkManufacturerSpelling(text: string, manufacturer: string | null): SuspiciousSign | null {
  if (!manufacturer) return null;
  const s = spellingSign(text, manufacturer, manufacturerCore(manufacturer));
  return s && { code: 'manufacturerSpelling', printed: s.printed, expected: manufacturer };
}

export function checkMissingBatch(batch: string | null): SuspiciousSign | null {
  return batch ? null : { code: 'missingBatch' };
}

export function checkMissingExpiry(dates: PackDates): SuspiciousSign | null {
  return dates.exp ? null : { code: 'missingExpiry' };
}

export function checkExpiryBeforeManufacture(dates: PackDates): SuspiciousSign | null {
  if (!dates.mfg || !dates.exp || compareDates(dates.exp, dates.mfg) > 0) return null;
  return { code: 'expiryBeforeManufacture', mfg: formatPackDate(dates.mfg), exp: formatPackDate(dates.exp) };
}

export function checkExpired(dates: PackDates, today: Date): SuspiciousSign | null {
  if (!dates.exp || expiryEndDate(dates.exp) >= today) return null;
  return { code: 'expired', exp: formatPackDate(dates.exp) };
}

export function checkPriceFarBelow(printedUnitPrice: number | null, databaseUnitPrice: number | null): SuspiciousSign | null {
  if (printedUnitPrice === null || databaseUnitPrice === null || databaseUnitPrice <= 0) return null;
  if (printedUnitPrice >= databaseUnitPrice * MEDICINE_CHECKS.priceFarBelowRatio) return null;
  return { code: 'priceFarBelow', printedUnitPrice, databaseUnitPrice };
}

/** All suspicious signs for a pack, in a stable order. An empty list means "No suspicious signs found". */
export function findSuspiciousSigns(input: PackCheckInput): SuspiciousSign[] {
  return [
    checkBrandSpelling(input.text, input.product.brand),
    checkManufacturerSpelling(input.text, input.product.manufacturer),
    checkMissingBatch(input.batch),
    // A missing expiry is NOT a sign: the date is often on another side or not readable in the photo. The expiry
    // card says "Expiry date not readable — please check the pack" instead (never a guess).
    checkExpiryBeforeManufacture(input.dates),
    checkExpired(input.dates, input.today),
    checkPriceFarBelow(input.printedUnitPrice, input.product.unitPrice),
  ].filter((s): s is SuspiciousSign => s !== null);
}

// ---------------------------------------------------------------------------------------------------------------
// Expiry status (shown on the results card; "expired" is also a suspicious sign)

export type ExpiryStatus =
  | { status: 'unknown' }
  | { status: 'expired'; exp: string; end: Date }
  | { status: 'expiresSoon'; exp: string; daysLeft: number; end: Date }
  | { status: 'ok'; exp: string; daysLeft: number; end: Date };

/** Expired / expires within EXPIRY.soonMonths calendar months / OK. Unknown when no EXP date was read. */
export function expiryStatus(dates: PackDates, today: Date): ExpiryStatus {
  if (!dates.exp) return { status: 'unknown' };
  const exp = formatPackDate(dates.exp);
  const end = expiryEndDate(dates.exp);
  if (end < today) return { status: 'expired', exp, end };
  const daysLeft = Math.floor((end.getTime() - today.getTime()) / 86_400_000);
  const soonLimit = new Date(today.getFullYear(), today.getMonth() + EXPIRY.soonMonths, today.getDate(), 23, 59, 59);
  return end <= soonLimit ? { status: 'expiresSoon', exp, daysLeft, end } : { status: 'ok', exp, daysLeft, end };
}

/**
 * Expiry status from printed text, e.g. "EXP 08/2027", "MFG 03/2025 EXP 02/2027", "EXP: AUG 27", "০৮/২০২৭".
 * Labelled dates are read with the pack parser (an MFG date is never taken as the expiry). Text with no label at
 * all is read as the expiry value itself (the caller says it is the expiry date). Anything else: not readable.
 */
export function expiryFromText(text: string, today: Date): { status: ExpiryStatus['status']; exp: string | null; mfg: string | null } {
  const dates = parsePackDates(text);
  const hasMfgLabel = /\b(?:mfg|mfd|manufactur)|উৎপাদন|উৎ\./i.test(text);
  // One expiry value, with or without a short label ("EXP 08/2027", "মেয়াদ: ০৮/২০২৭", "08/2027"). Never when an MFG
  // label is present: then only the parser's labelled EXP counts.
  const single = text.replace(/^\s*(?:মেয়াদ\S*(?:\s+উত্তীর্ণের)?(?:\s+তারিখ)?|exp\S*(?:\s*date)?|use\s*(?:by|before)|best\s*before)[\s.:\-]*/i, '');
  const exp = dates.exp ?? (hasMfgLabel ? null : parseDateValue(single, 'exp'));
  const mfg = dates.mfg ? formatPackDate(dates.mfg) : null;
  if (!exp) return { status: 'unknown', exp: null, mfg };
  return { status: expiryStatus({ exp }, today).status, exp: formatPackDate(exp), mfg };
}
