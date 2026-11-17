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
import { compareDates, expiryEndDate, formatPackDate, type PackDates } from '@/lib/ocr/expiry';

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
  for (let i = 0; i + n <= words.length; i++) {
    const printed = words.slice(i, i + n).join(' ').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
    const distance = editDistance(foldOcrConfusions(nameKey(printed)), targetKey);
    if (!best || distance < best.distance) best = { printed, distance };
    if (distance === 0) break;
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
    checkMissingExpiry(input.dates),
    checkExpiryBeforeManufacture(input.dates),
    checkExpired(input.dates, input.today),
    checkPriceFarBelow(input.printedUnitPrice, input.product.unitPrice),
  ].filter((s): s is SuspiciousSign => s !== null);
}

// ---------------------------------------------------------------------------------------------------------------
// Expiry status (shown on the results card; "expired" is also a suspicious sign)

export type ExpiryStatus =
  | { status: 'unknown' }
  | { status: 'expired'; exp: string }
  | { status: 'expiresSoon'; exp: string; daysLeft: number }
  | { status: 'ok'; exp: string; daysLeft: number };

export function expiryStatus(dates: PackDates, today: Date): ExpiryStatus {
  if (!dates.exp) return { status: 'unknown' };
  const exp = formatPackDate(dates.exp);
  const end = expiryEndDate(dates.exp);
  if (end < today) return { status: 'expired', exp };
  const daysLeft = Math.floor((end.getTime() - today.getTime()) / 86_400_000);
  return daysLeft <= MEDICINE_CHECKS.expiresSoonDays ? { status: 'expiresSoon', exp, daysLeft } : { status: 'ok', exp, daysLeft };
}
