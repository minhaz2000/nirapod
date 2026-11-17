import { describe, expect, it } from 'vitest';
import { compareDates, expiryEndDate, formatPackDate, parsePackDates } from '@/lib/ocr/expiry';

describe('parsePackDates — formats seen on Bangladeshi packs', () => {
  it.each([
    ['Mfg. Date: 05/2024\nExp. Date: 04/2026', { year: 2024, month: 5 }, { year: 2026, month: 4 }],
    ['MFG. DATE: 05-2024 EXP. DATE: 04-2026', { year: 2024, month: 5 }, { year: 2026, month: 4 }],
    ['MFD 05/24 EXP 04/26', { year: 2024, month: 5 }, { year: 2026, month: 4 }],
    ['Mfg.Dt. 03.24 Exp.Dt. 02.27', { year: 2024, month: 3 }, { year: 2027, month: 2 }],
    ['Mfg: JAN 2024  Exp: DEC 2025', { year: 2024, month: 1 }, { year: 2025, month: 12 }],
    ['MFG.DATE:SEP-23 EXP.DATE:AUG-25', { year: 2023, month: 9 }, { year: 2025, month: 8 }],
    ['Mfg. Date: 15/01/2024 Exp. Date: 14/01/2026', { year: 2024, month: 1, day: 15 }, { year: 2026, month: 1, day: 14 }],
    ['Manufacturing Date 2024/06 Expiry Date 2026/05', { year: 2024, month: 6 }, { year: 2026, month: 5 }],
  ])('%s', (text, mfg, exp) => {
    expect(parsePackDates(text)).toEqual({ mfg, exp });
  });

  it('Bangla labels and Bangla digits', () => {
    expect(parsePackDates('উৎপাদন তারিখ: ০৫/২০২৪\nমেয়াদ উত্তীর্ণের তারিখ: ০৪/২০২৬')).toEqual({
      mfg: { year: 2024, month: 5 },
      exp: { year: 2026, month: 4 },
    });
  });

  it('labels on one line, dates on the next', () => {
    expect(parsePackDates('B.No. 2405123  MFG. DATE  EXP. DATE\n2405123 05/2024 04/2026')).toMatchObject({
      mfg: { year: 2024, month: 5 },
      exp: { year: 2026, month: 4 },
    });
  });

  it('fixes O/0 and l/1 OCR mix-ups inside numbers', () => {
    expect(parsePackDates('EXP: O4/2O26')).toEqual({ exp: { year: 2026, month: 4 } });
    expect(parsePackDates('Exp. Date: l2/2025')).toEqual({ exp: { year: 2025, month: 12 } });
  });

  it('"Use before" counts as expiry', () => {
    expect(parsePackDates('Use before 12/2026').exp).toEqual({ year: 2026, month: 12 });
  });

  it('ignores the manufacturing licence number and prices', () => {
    expect(parsePackDates('Mfg. Lic. No. 237  MRP Tk. 12.00')).toEqual({});
  });

  it('keeps an expiry that is genuinely before manufacture when both are labelled', () => {
    expect(parsePackDates('Mfg. Date: 06/2025 Exp. Date: 01/2024')).toEqual({
      mfg: { year: 2025, month: 6 },
      exp: { year: 2024, month: 1 },
    });
  });

  it('rejects impossible months', () => {
    expect(parsePackDates('Exp. Date: 13/2026')).toEqual({});
  });
});

describe('date helpers', () => {
  it('MM/YYYY expires at the end of that month', () => {
    const end = expiryEndDate({ year: 2026, month: 2 });
    expect([end.getFullYear(), end.getMonth() + 1, end.getDate()]).toEqual([2026, 2, 28]);
  });
  it('compares and formats', () => {
    expect(compareDates({ year: 2024, month: 5 }, { year: 2026, month: 4 })).toBeLessThan(0);
    expect(formatPackDate({ year: 2026, month: 4 })).toBe('04/2026');
    expect(formatPackDate({ year: 2026, month: 1, day: 9 })).toBe('09/01/2026');
  });
});
