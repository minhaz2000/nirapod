/**
 * Printed lab-report parser: finds rows of "test name  value  unit  reference range" in OCR text, e.g.
 *   "Fasting Blood Sugar   7.8   mmol/L   3.9 - 5.6"
 *   "HbA1c 8.1 % (4.0-5.6)"            "Haemoglobin 10.2 L g/dL 12.0 - 15.5"
 *   "SGPT (ALT) 32 U/L Up to 40"        "Total Cholesterol 248 mg/dL < 200"
 *   "Platelet Count 1,50,000 /cumm 1,50,000 - 4,00,000"
 * A row is kept only if it has a reference range (usable or suspect) or is a test we recognise, so "Age: 52 Years"
 * is not taken for a test.
 */
import { FALLBACK_RANGES } from '@/config/report-ranges';
import { normaliseOcrText } from './text';

export interface PrintedRange {
  low?: number;
  high?: number;
  /** As printed, for display. */
  text: string;
}

/**
 * How far to trust the printed range after OCR. OCR often drops decimal points in ranges ("4.0 - 5.6" → "40-56").
 * 'repaired': a clear misread was corrected (shown to the user to check); 'suspect': the range is implausible and
 * is NOT used to flag the value.
 */
export type RangeNote = 'repaired' | 'suspect' | null;

export interface ReportEntry {
  /** Test name as printed. */
  name: string;
  /** Canonical key from config/report-ranges.ts, or null if not recognised. */
  key: string | null;
  value: number;
  /** Unit as printed ('' if none). */
  unit: string;
  range: PrintedRange | null;
  rangeNote: RangeNote;
  /** H / L flag printed next to the value, if any. */
  printedFlag: 'high' | 'low' | null;
}

const NUM = String.raw`\d[\d,]*(?:\.\d+)?`;
const toNumber = (s: string) => Number(s.replace(/,/g, ''));

/** Name key for matching aliases: lower case, letters/digits only, single spaces. */
export function testNameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Unit key: lower case, no spaces, µ/μ → u, "x10^9/l" → "10^9/l", miu/l == uiu/ml (TSH). */
export function unitKey(unit: string): string {
  const u = unit
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[µμ]/g, 'u')
    .replace(/^[x×*]/, '')
    .replace(/^10\*?(\d)/, '10^$1')
    .replace(/^(iu|u)\/l$/, 'u/l')
    .replace(/^(uiu\/ml|miu\/l|mu\/l)$/, 'miu/l')
    .replace(/^\/(cmm|cumm|mm3|cu\.mm|ul)$/, '/cumm');
  return u;
}

const ALIASES: Array<{ alias: string; key: string }> = FALLBACK_RANGES.flatMap((r) => r.names.map((alias) => ({ alias, key: r.key })))
  .filter((v, i, all) => all.findIndex((w) => w.alias === v.alias) === i)
  .sort((a, b) => b.alias.length - a.alias.length);

/** Canonical test key for a printed name, by exact alias or alias contained as whole words. */
export function canonicalTestKey(name: string): string | null {
  const k = testNameKey(name);
  if (!k) return null;
  const exact = ALIASES.find((a) => a.alias === k);
  if (exact) return exact.key;
  const padded = ` ${k} `;
  const contained = ALIASES.find((a) => a.alias.length >= 3 && padded.includes(` ${a.alias} `));
  return contained?.key ?? null;
}

const NOT_TESTS = /^(age|date|sex|gender|patient|name|id|phone|mobile|bed|ref|reg|sample|collected|received|reported|page|bill|invoice|time|specimen|cabin|ward)\b/i;

const RANGE = new RegExp(
  [
    String.raw`(?<lo>${NUM})\s*(?:-|–|to)\s*(?<hi>${NUM})`,
    String.raw`(?:<=?|≤|up\s*to|upto|less\s*than|below)\s*(?<hi2>${NUM})`,
    String.raw`(?:>=?|≥|more\s*than|above|greater\s*than)\s*(?<lo2>${NUM})`,
  ].join('|'),
  'i',
);
const FLAG = /(?:^|\s)(?:\*?(H|L)\*?|(high|low)|(↑)|(↓))(?=\s|$)/i;
const UNIT = /^(?:%|[x×*]?\s?10\^?\*?\d+\/[a-z]+|\/[a-z.]+\d?|[a-zµμ]+\/[a-z0-9.]+|[a-zµμ]+\/l|[a-z]{1,4}\/[a-z]{1,3})$/i;

const decimals = (raw: string) => (raw.includes('.') ? raw.split('.')[1]!.length : 0);

/**
 * Builds the printed range and repairs common OCR misreads of decimal points:
 *  1. a bound with a leading zero is a lost decimal ("06" → 0.6);
 *  2. when one bound has decimals and the other is a plain integer that is too large, the other lost its point
 *     ("0.6 - 11" → 0.6 - 1.1, "12.0 - 155" → 12.0 - 15.5);
 *  3. for a recognised test, a range ~10× off its fallback range is divided by 10 if that matches the fallback
 *     ("40 - 56" for HbA1c → 4.0 - 5.6).
 * A value with decimals lying more than 3× outside a range with integer bounds is otherwise marked 'suspect'.
 */
export function repairRange(
  m: RegExpMatchArray,
  valueRaw: string,
  key: string | null,
  unit: string,
): { range: PrintedRange | null; note: RangeNote } {
  const g = m.groups ?? {};
  let loRaw = g.lo ?? g.lo2;
  let hiRaw = g.hi ?? g.hi2;
  let note: RangeNote = null;
  const fix = (raw: string | undefined) => (raw && /^0\d+$/.test(raw) ? `0.${raw.slice(1)}` : raw);
  const lo0 = loRaw;
  const hi0 = hiRaw;
  loRaw = fix(loRaw);
  hiRaw = fix(hiRaw);
  if (loRaw !== lo0 || hiRaw !== hi0) note = 'repaired';

  if (loRaw && hiRaw) {
    const lo = toNumber(loRaw);
    const hi = toNumber(hiRaw);
    const tenth = (raw: string) => toNumber(raw) / 10;
    if (decimals(loRaw) === 1 && decimals(hiRaw) === 0 && /^\d{2,3}$/.test(hiRaw) && tenth(hiRaw) > lo && hi / lo > 5) {
      hiRaw = String(tenth(hiRaw));
      note = 'repaired';
    } else if (decimals(hiRaw) === 1 && decimals(loRaw) === 0 && /^\d{2,3}$/.test(loRaw) && lo > hi) {
      loRaw = String(tenth(loRaw));
      note = 'repaired';
    }
  }

  let low = loRaw ? toNumber(loRaw) : undefined;
  let high = hiRaw ? toNumber(hiRaw) : undefined;
  if (low === undefined && high === undefined) return { range: null, note: null };
  if (low !== undefined && high !== undefined && low > high) return { range: null, note: 'suspect' };

  const value = toNumber(valueRaw);
  const intBounds = [loRaw, hiRaw].every((r) => r === undefined || decimals(r) === 0);
  const farOutside = (low !== undefined && value * 3 < low) || (high !== undefined && value > high * 3);
  if (decimals(valueRaw) > 0 && intBounds && farOutside) {
    const fb = key ? FALLBACK_RANGES.find((f) => f.key === key && f.unit === unitKey(unit)) : undefined;
    const near = (a: number | undefined, b: number | undefined) => a === undefined || b === undefined || (a / b < 1.5 && b / a < 1.5);
    const l10 = low !== undefined ? low / 10 : undefined;
    const h10 = high !== undefined ? high / 10 : undefined;
    if (fb && near(l10, fb.low) && near(h10, fb.high)) {
      low = l10;
      high = h10;
      note = 'repaired';
    } else {
      return { range: null, note: 'suspect' };
    }
  }

  const fmt = (n: number | undefined) => (n === undefined ? '' : String(n));
  const text =
    note === 'repaired'
      ? low !== undefined && high !== undefined
        ? `${fmt(low)} - ${fmt(high)}`
        : high !== undefined
          ? `< ${fmt(high)}`
          : `> ${fmt(low)}`
      : m[0].trim();
  return { range: { low, high, text }, note };
}

/** Parses a range typed by the user ("3.9 - 5.6", "< 200", "up to 40"). */
export function parseRangeText(text: string): PrintedRange | null {
  const m = normaliseOcrText(text).match(RANGE);
  if (!m?.groups) return null;
  const g = m.groups;
  const low = g.lo ?? g.lo2;
  const high = g.hi ?? g.hi2;
  const range = { low: low ? toNumber(low) : undefined, high: high ? toNumber(high) : undefined, text: m[0].trim() };
  return range.low !== undefined && range.high !== undefined && range.low > range.high ? null : range;
}

function parseLine(line: string): ReportEntry | null {
  const m = line.match(new RegExp(String.raw`^(?<name>.*?[A-Za-z]{2}.*?)[\s:]+(?<value>${NUM})(?=\s|$|[HL]\b)(?<rest>.*)$`));
  if (!m?.groups) return null;
  const name = m.groups.name!.replace(/[\s:.\-]+$/, '').trim();
  if (!name || NOT_TESTS.test(name) || /\d{2}[/-]\d{2}/.test(name)) return null;
  const value = toNumber(m.groups.value!);
  let rest = ` ${m.groups.rest ?? ''} `;

  let printedFlag: ReportEntry['printedFlag'] = null;
  const flag = rest.match(FLAG);
  if (flag) {
    const f = (flag[1] ?? flag[2] ?? '').toLowerCase();
    printedFlag = f.startsWith('h') || flag[3] ? 'high' : f.startsWith('l') || flag[4] ? 'low' : null;
    rest = rest.replace(flag[0], ' ');
  }

  const rangeMatch = rest.match(RANGE);
  if (rangeMatch) rest = rest.replace(rangeMatch[0], ' ');
  const unit = rest
    .replace(/[()[\]]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .find((t) => t && UNIT.test(t)) ?? '';

  const key = canonicalTestKey(name);
  const { range, note } = rangeMatch ? repairRange(rangeMatch, m.groups.value!, key, unit) : { range: null, note: null };
  // Keep a row if it is a known test, has a usable range, or had a range we could not trust (shown for checking).
  if (!range && !key && note !== 'suspect') return null;
  return { name, key, value, unit, range, rangeNote: note, printedFlag };
}

export function parseReport(raw: string): ReportEntry[] {
  const out: ReportEntry[] = [];
  for (const line of normaliseOcrText(raw).split('\n')) {
    const e = parseLine(line);
    if (e) out.push(e);
  }
  return out;
}
