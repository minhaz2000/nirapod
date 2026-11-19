import { describe, expect, it } from 'vitest';
import { EXPIRY } from '@/config/expiry';
import { parseDateValue, parsePackDates } from '@/lib/ocr/expiry';
import { expiryStatus } from '@/lib/rules/medicine';

const TODAY = new Date(2026, 10, 19); // 19 Nov 2026

describe('expiry formats', () => {
  it.each([
    ['EXP 08/2027', { month: 8, year: 2027 }],
    ['EXP: AUG 27', { month: 8, year: 2027 }],
    ['Exp. Date: 08-2027', { month: 8, year: 2027 }],
    ['EXP. 31.08.2027', { day: 31, month: 8, year: 2027 }],
    ['Use before AUGUST 2027', { month: 8, year: 2027 }],
    ['Exp.Date:08/27', { month: 8, year: 2027 }],
    ['মেয়াদ উত্তীর্ণের তারিখ: ০৮/২০২৭', { month: 8, year: 2027 }],
    ['মেঃ উঃ তাঃ ৩১.০৮.২০২৭', { day: 31, month: 8, year: 2027 }],
  ])('%s', (text, exp) => {
    expect(parsePackDates(text).exp).toEqual(exp);
  });

  it('a value whose label is already known (the vision model field)', () => {
    expect(parseDateValue('08-2027', 'exp')).toEqual({ month: 8, year: 2027 });
    expect(parseDateValue('AUG 27', 'exp')).toEqual({ month: 8, year: 2027 });
    expect(parseDateValue('31.08.2027', 'exp')).toEqual({ day: 31, month: 8, year: 2027 });
    expect(parseDateValue('০৮/২০২৭', 'exp')).toEqual({ month: 8, year: 2027 });
    expect(parseDateValue('', 'exp')).toBeNull();
    expect(parseDateValue('13/2027', 'exp')).toBeNull(); // no month 13: unreadable, not a guess
  });
});

describe('MFG is never taken for EXP', () => {
  it.each([
    ['MFG: 08/2025 EXP: 07/2027'],
    ['EXP: 07/2027 MFG: 08/2025'],
    ['Mfg. Date: AUG 25\nExp. Date: JUL 27'],
    ['MFD 08-25 EXP 07-27'],
    ['উৎপাদন তারিখ: ০৮/২০২৫ মেয়াদ উত্তীর্ণের তারিখ: ০৭/২০২৭'],
  ])('%s', (text) => {
    expect(parsePackDates(text)).toEqual({ mfg: { month: 8, year: 2025 }, exp: { month: 7, year: 2027 } });
  });

  it('a pack with only a manufacturing date has no expiry', () => {
    expect(parsePackDates('Mfg. Date: 03/2025\nBatch NP2503')).toEqual({ mfg: { month: 3, year: 2025 } });
    expect(parsePackDates('Mfg. Lic. No. 123 EXP 08/27').exp).toEqual({ month: 8, year: 2027 }); // licence is not a date
  });
});

describe('unreadable expiry', () => {
  it.each([['08-2027'], ['Batch 2503 Exp'], ['EXP ??/2027'], ['EXP 13/2027'], ['No Pain 50 mg Tablet'], ['']])('"%s" → no expiry (never guessed)', (text) => {
    expect(parsePackDates(text).exp).toBeUndefined();
    expect(expiryStatus(parsePackDates(text), TODAY)).toEqual({ status: 'unknown' });
  });
});

describe('expiry status (thresholds in config/expiry.ts)', () => {
  it(`expires soon = within ${EXPIRY.soonMonths} months`, () => {
    expect(EXPIRY.soonMonths).toBe(3);
  });
  it('Expired / Expires within 3 months / OK until', () => {
    expect(expiryStatus({ exp: { year: 2026, month: 10 } }, TODAY).status).toBe('expired');
    expect(expiryStatus({ exp: { year: 2026, month: 11, day: 18 } }, TODAY).status).toBe('expired');
    expect(expiryStatus({ exp: { year: 2026, month: 11 } }, TODAY).status).toBe('expiresSoon'); // until 30 Nov
    expect(expiryStatus({ exp: { year: 2027, month: 1 } }, TODAY).status).toBe('expiresSoon');
    expect(expiryStatus({ exp: { year: 2027, month: 2, day: 19 } }, TODAY).status).toBe('expiresSoon'); // exactly 3 months
    expect(expiryStatus({ exp: { year: 2027, month: 2 } }, TODAY).status).toBe('ok'); // 28 Feb 2027 > 19 Feb
    expect(expiryStatus({ exp: { year: 2027, month: 8 } }, TODAY)).toMatchObject({ status: 'ok', exp: '08/2027' });
  });
});
