/**
 * Flags lab values outside their reference range.
 * The range PRINTED on the report wins; a fallback range from config/report-ranges.ts (needs clinician review) is
 * used only when none is printed and the unit matches. Results are "outside the range", never a diagnosis (rule 1).
 */
import { FALLBACK_RANGES, GLUCOSE_TEST_KEYS } from '@/config/report-ranges';
import { isLowGlucose, toMmol } from '@/lib/rules/glucose';
import { unitKey, type ReportEntry } from '@/lib/ocr/report';

export type RangeStatus = 'low' | 'high' | 'normal' | 'unknown';

export interface CheckedValue extends ReportEntry {
  status: RangeStatus;
  /** Where the range came from. */
  rangeSource: 'printed' | 'fallback' | 'printed-flag' | 'none';
  /** The printed range could not be read reliably (see RangeNote); the value is not flagged from it. */
  rangeSuspect: boolean;
  /** The range used for the decision, if any. */
  usedRange: { low?: number; high?: number } | null;
  /** Rule 6: a glucose value below 3.9 mmol/L (70 mg/dL). */
  lowGlucoseEmergency: boolean;
}

export function fallbackRange(key: string | null, unit: string): { low?: number; high?: number } | null {
  if (!key) return null;
  const u = unitKey(unit);
  const r = FALLBACK_RANGES.find((f) => f.key === key && f.unit === u);
  return r ? { low: r.low, high: r.high } : null;
}

export function statusFor(value: number, range: { low?: number; high?: number }): RangeStatus {
  if (range.low !== undefined && value < range.low) return 'low';
  if (range.high !== undefined && value > range.high) return 'high';
  return 'normal';
}

function glucoseMmol(entry: ReportEntry): number | null {
  if (!entry.key || !(GLUCOSE_TEST_KEYS as readonly string[]).includes(entry.key)) return null;
  const u = unitKey(entry.unit);
  if (u === 'mmol/l') return entry.value;
  if (u === 'mg/dl') return toMmol(entry.value, 'mgdl');
  return null;
}

export function checkValue(entry: ReportEntry): CheckedValue {
  const mmol = glucoseMmol(entry);
  const lowGlucoseEmergency = mmol !== null && isLowGlucose(mmol);
  const rangeSuspect = entry.rangeNote === 'suspect';
  const base = { ...entry, lowGlucoseEmergency, rangeSuspect };
  if (entry.range) {
    return { ...base, status: statusFor(entry.value, entry.range), rangeSource: 'printed', usedRange: entry.range };
  }
  const fb = fallbackRange(entry.key, entry.unit);
  if (fb) return { ...base, status: statusFor(entry.value, fb), rangeSource: 'fallback', usedRange: fb };
  if (entry.printedFlag) return { ...base, status: entry.printedFlag, rangeSource: 'printed-flag', usedRange: null };
  return { ...base, status: 'unknown', rangeSource: 'none', usedRange: null };
}

export function checkReport(entries: readonly ReportEntry[]): CheckedValue[] {
  return entries.map(checkValue);
}

export const isOutOfRange = (c: CheckedValue) => c.status === 'low' || c.status === 'high';
