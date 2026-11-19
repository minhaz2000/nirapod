/**
 * Manufacture (MFG) and expiry (EXP) dates as printed on Bangladeshi medicine packs, e.g.
 *   "Mfg. Date: 05/2024  Exp. Date: 04/2026", "MFD 05-24 EXP 04-26", "Mfg.Dt. JAN 2024 Exp.Dt. DEC 2025",
 *   "EXP: 31/12/2025", "Use before 12/2026", "উৎপাদন তারিখ: ০৫/২০২৪  মেয়াদ উত্তীর্ণের তারিখ: ০৪/২০২৬",
 * and the two-line layout "MFG. DATE  EXP. DATE" / "05/2024  04/2026".
 * "Mfg. Lic. No." (manufacturing licence) is not a date and is ignored.
 */
import { normaliseOcrText } from './text';

export interface PackDate {
  year: number;
  month: number;
  day?: number;
}

export interface PackDates {
  mfg?: PackDate;
  exp?: PackDate;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  january: 1, february: 2, march: 3, april: 4, june: 6, july: 7, august: 8, september: 9, october: 10,
  november: 11, december: 12,
};
const MONTH_NAMES = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');

const MFG_LABEL =
  /(?:\bmfg|\bmfd|\bmanufactur(?:ed|ing)(?:\s*on)?|\bdate\s*of\s*(?:mfg|manufacture)|\bprod(?:uction|\.)?\s*date|উৎপাদন(?:ের)?\s*তারিখ|উৎ\.?\s*তাঃ?)(?![\s.:]*lic)(?:[\s.]*(?:date|dt)\b)?[\s.:\-]*/gi;
const EXP_LABEL =
  /(?:\bexp(?:iry|iration|\.)?(?:[\s.]*(?:date|dt)\b)?|\bexpires?(?:\s*on)?|\buse\s*(?:by|before)|\bbest\s*before|মেয়াদ(?:\s*উত্তীর্ণের|োত্তীর্ণের)?\s*তারিখ|মেঃ?\s*উঃ?\s*তাঃ?)[\s.:\-]*/gi;

// Three-part numeric (day/month/year), two-part numeric (month/year), or month name + year.
const DATE_TOKEN = new RegExp(
  [
    String.raw`(?<d>\d{1,2})\s*[./\-]\s*(?<m>\d{1,2})\s*[./\-]\s*(?<y>\d{4}|\d{2})(?!\d)`,
    String.raw`(?<m2>\d{1,2})\s*[./\- ]\s*(?<y2>\d{4}|\d{2})(?![\d./\-]*\d)`,
    String.raw`(?<mon>${MONTH_NAMES})\.?\s*[\-/,.' ]?\s*(?<y3>\d{4}|\d{2})(?!\d)`,
    String.raw`(?<y4>20\d{2})\s*[./\-]\s*(?<m4>\d{1,2})(?![\d./\-]*\d)`,
  ].join('|'),
  'gi',
);

/** OCR reads O for 0 and l/I for 1 inside numbers. */
function fixDigits(s: string): string {
  return s.replace(/(?<=\d)[oO]|[oO](?=\d)/g, '0').replace(/(?<=\d)[lI|]|[lI|](?=\d)/g, '1');
}

function toYear(y: string): number {
  const n = Number(y);
  return y.length === 2 ? 2000 + n : n;
}

function valid(d: PackDate): PackDate | null {
  if (d.year < 2005 || d.year > 2099 || d.month < 1 || d.month > 12) return null;
  if (d.day !== undefined && (d.day < 1 || d.day > 31)) return null;
  return d;
}

interface Token {
  index: number;
  end: number;
  date: PackDate;
}

function dateTokens(text: string): Token[] {
  const out: Token[] = [];
  for (const m of text.matchAll(DATE_TOKEN)) {
    const g = m.groups!;
    let d: PackDate | null = null;
    if (g.d) d = valid({ day: Number(g.d), month: Number(g.m), year: toYear(g.y!) });
    else if (g.m2) d = valid({ month: Number(g.m2), year: toYear(g.y2!) });
    else if (g.mon) d = valid({ month: MONTHS[g.mon.toLowerCase()]!, year: toYear(g.y3!) });
    else if (g.y4) d = valid({ month: Number(g.m4), year: Number(g.y4) });
    if (d) out.push({ index: m.index!, end: m.index! + m[0].length, date: d });
  }
  return out;
}

interface Label {
  kind: 'mfg' | 'exp';
  index: number;
  end: number;
}

function labels(text: string): Label[] {
  const found: Label[] = [];
  for (const m of text.matchAll(MFG_LABEL)) found.push({ kind: 'mfg', index: m.index!, end: m.index! + m[0].length });
  for (const m of text.matchAll(EXP_LABEL)) found.push({ kind: 'exp', index: m.index!, end: m.index! + m[0].length });
  return found.sort((a, b) => a.index - b.index);
}

export function compareDates(a: PackDate, b: PackDate): number {
  return a.year - b.year || a.month - b.month || (a.day ?? 1) - (b.day ?? 1);
}

export function parsePackDates(raw: string): PackDates {
  const text = fixDigits(normaliseOcrText(raw));
  const tokens = dateTokens(text);
  const used = new Set<Token>();
  const result: PackDates = {};
  const unresolved: Label[] = [];

  // 1. A date right after its label (same line, within a few characters).
  for (const label of labels(text)) {
    if (result[label.kind]) continue;
    const t = tokens.find((tok) => !used.has(tok) && tok.index >= label.end && tok.index - label.end <= 3);
    if (t) {
      used.add(t);
      result[label.kind] = t.date;
    } else unresolved.push(label);
  }

  // 2. Labels on one line, dates on the next ("MFG. DATE EXP. DATE" / "05/2024 04/2026"): pair in order.
  const pending = unresolved.filter((l) => !result[l.kind]);
  if (pending.length) {
    const free = tokens.filter((t) => !used.has(t) && t.index > pending[0]!.index);
    pending.forEach((label, i) => {
      const t = free[i];
      if (t && !result[label.kind]) result[label.kind] = t.date;
    });
    // Positional pairing is a guess: if it produced EXP before MFG, the columns were probably the other way round.
    if (result.mfg && result.exp && compareDates(result.exp, result.mfg) < 0 && pending.length === 2) {
      [result.mfg, result.exp] = [result.exp, result.mfg];
    }
  }
  return result;
}

/** Last day the medicine may be used: the given day, or the last day of the month for MM/YYYY. */
export function expiryEndDate(d: PackDate): Date {
  return d.day ? new Date(d.year, d.month - 1, d.day, 23, 59, 59) : new Date(d.year, d.month, 0, 23, 59, 59);
}

export function formatPackDate(d: PackDate): string {
  const mm = String(d.month).padStart(2, '0');
  return d.day ? `${String(d.day).padStart(2, '0')}/${mm}/${d.year}` : `${mm}/${d.year}`;
}

/**
 * A single date value whose meaning is already known (e.g. the vision model's "expiry_date" field: "08-2027",
 * "AUG 27", "31.08.2027"). Returns null when it is not a readable month and year — never a guess.
 */
export function parseDateValue(value: string | null | undefined, kind: 'exp' | 'mfg'): PackDate | null {
  if (!value?.trim()) return null;
  return parsePackDates(`${kind === 'exp' ? 'EXP' : 'MFG'} ${value.trim()}`)[kind] ?? null;
}
