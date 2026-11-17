import { describe, expect, it } from 'vitest';
import { parseBatch } from '@/lib/ocr/batch';
import { parsePrice, printedUnitPrice } from '@/lib/ocr/price';
import { parseRegistration } from '@/lib/ocr/registration';
import { brandCandidates, readPack } from '@/lib/ocr/pack';
import { normaliseOcrText, toAsciiDigits } from '@/lib/ocr/text';

describe('text helpers', () => {
  it('Bangla digits → ASCII', () => {
    expect(toAsciiDigits('০৫/২০২৪')).toBe('05/2024');
  });
  it('normalises quotes, colons, dashes and spaces', () => {
    expect(normaliseOcrText('Exp：  04–2026 ')).toBe('Exp: 04-2026');
  });
});

describe('parseBatch', () => {
  it.each([
    ['Batch No.: 2405123', '2405123'],
    ['BATCH NO 24A0512', '24A0512'],
    ['B. No. MN24012', 'MN24012'],
    ['B.No.:SP-2401', 'SP-2401'],
    ['B.N. 23K045', '23K045'],
    ['Lot No: 24a12', '24A12'],
    ['ব্যাচ নং: ২৪০৫১২৩', '2405123'],
  ])('%s → %s', (text, code) => {
    expect(parseBatch(text)).toBe(code);
  });

  it('returns null when there is no batch or the value has no digit', () => {
    expect(parseBatch('Napa 500 mg Tablet\nBeximco Pharmaceuticals Ltd.')).toBeNull();
    expect(parseBatch('Batch No.: ')).toBeNull();
    expect(parseBatch('Batch No: ABC')).toBeNull();
  });

  it('does not confuse Reg. No. or Mfg. Lic. No. with a batch', () => {
    expect(parseBatch('Reg. No. 037-0123-045\nMfg. Lic. No. 237')).toBeNull();
  });
});

describe('parsePrice', () => {
  it.each([
    ['MRP Tk. 8.00 per Tablet', { amount: 8, per: 'unit', count: 1 }],
    ['M.R.P: ৳ 120.00', { amount: 120, per: null, count: null }],
    ['Retail Price Tk 80.00 per 10 Tablets', { amount: 80, per: 'pack', count: 10 }],
    ['MRP: Tk. 30.00/Strip', { amount: 30, per: 'strip', count: null }],
    ['MRP Tk 12.00 per strip of 10 tablets', { amount: 12, per: 'strip', count: 10 }],
    ['Price 35.00 Taka', { amount: 35, per: null, count: null }],
    ['Max. Retail Price Tk. 1.20/Tab', { amount: 1.2, per: 'unit', count: 1 }],
    ['সর্বোচ্চ খুচরা মূল্য: ৮.০০ টাকা প্রতি ট্যাবলেট', { amount: 8, per: 'unit', count: 1 }],
    ['MRP Tk. 48.19 per bottle', { amount: 48.19, per: 'bottle', count: null }],
  ])('%s', (text, expected) => {
    expect(parsePrice(text)).toEqual(expected);
  });

  it('returns null without a price label', () => {
    expect(parsePrice('Napa 500 mg\nExp 04/2026')).toBeNull();
  });

  it('unit price only when the printed text says what it covers', () => {
    expect(printedUnitPrice(parsePrice('MRP Tk. 1.20 per tablet'))).toBe(1.2);
    expect(printedUnitPrice(parsePrice('Retail Price Tk 12.00 per 10 Tablets'))).toBe(1.2);
    expect(printedUnitPrice(parsePrice('MRP: Tk. 30.00/Strip'))).toBeNull();
    expect(printedUnitPrice(null)).toBeNull();
  });
});

describe('parseRegistration', () => {
  it.each([
    ['DAR No.: 123-0045-067', '123-0045-067'],
    ['D.A.R. No. 345-123-456', '345-123-456'],
    ['Reg. No. 037-0123-045', '037-0123-045'],
    ['Drug Reg. No: 241 - 0012 - 031', '241-0012-031'],
    ['নিবন্ধন নং: ১২৩-০০৪৫-০৬৭', '123-0045-067'],
  ])('%s → %s', (text, code) => {
    expect(parseRegistration(text)).toBe(code);
  });

  it('returns null when absent', () => {
    expect(parseRegistration('Batch No. 2405123')).toBeNull();
  });
});

describe('readPack + brand candidates', () => {
  const text = [
    'Napa',
    'Paracetamol BP 500 mg',
    'Tablet',
    'Beximco Pharmaceuticals Ltd.',
    'Tongi, Gazipur, Bangladesh',
    'Batch No.: 2405123',
    'Mfg. Date: 05/2024  Exp. Date: 04/2026',
    'MRP Tk. 1.20 per Tablet',
    'DAR No. 037-0123-045',
  ].join('\n');

  it('reads every field from one pack', () => {
    const r = readPack(text, [
      { text: 'Napa', confidence: 92, height: 80 },
      { text: 'Paracetamol', confidence: 90, height: 30 },
      { text: 'Beximco', confidence: 88, height: 22 },
      { text: 'Tablet', confidence: 91, height: 30 },
    ]);
    expect(r.batch).toBe('2405123');
    expect(r.dates).toEqual({ mfg: { year: 2024, month: 5 }, exp: { year: 2026, month: 4 } });
    expect(r.price).toEqual({ amount: 1.2, per: 'unit', count: 1 });
    expect(r.registration).toBe('037-0123-045');
    expect(r.brandCandidates).toEqual(['Napa', 'Paracetamol', 'Beximco']);
  });

  it('falls back to text order without word sizes and skips pack words', () => {
    expect(brandCandidates([], 'Tablet\nSeclo 20 mg Capsule\nSquare Pharmaceuticals Ltd.')).toEqual(['Seclo', 'Square']);
  });

  it('skips low-confidence words', () => {
    expect(brandCandidates([{ text: 'Xqzt', confidence: 12, height: 90 }, { text: 'Seclo', confidence: 85, height: 60 }], '')).toEqual([
      'Seclo',
    ]);
  });
});
