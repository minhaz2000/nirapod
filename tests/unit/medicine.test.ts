import { describe, expect, it } from 'vitest';
import {
  checkBrandSpelling,
  checkExpired,
  checkExpiryBeforeManufacture,
  checkManufacturerSpelling,
  checkMissingBatch,
  checkMissingExpiry,
  checkPriceFarBelow,
  closestPrintedText,
  expiryStatus,
  findDuplicateGenerics,
  findSuspiciousSigns,
  manufacturerCore,
} from '@/lib/rules/medicine';
import { readPack } from '@/lib/ocr/pack';
import { printedUnitPrice } from '@/lib/ocr/price';

const TODAY = new Date(2026, 10, 17); // 17 Nov 2026
const NAPA = { brand: 'Napa', manufacturer: 'Beximco Pharmaceuticals Ltd.', unitPrice: 0.8 };
const SECLO = { brand: 'Seclo', manufacturer: 'Square Pharmaceuticals Ltd.', unitPrice: 5 };

describe('duplicate generics', () => {
  it('flags duplicate generics (Napa + Ace are both paracetamol)', () => {
    const dupes = findDuplicateGenerics([
      { brand: 'Napa', generic: 'Paracetamol', strength: '500 mg', dosageForm: 'Tablet' },
      { brand: 'Ace', generic: 'paracetamol', strength: '500 mg', dosageForm: 'Tablet' },
      { brand: 'Seclo', generic: 'Omeprazole', strength: '20 mg', dosageForm: 'Capsule' },
    ]);
    expect(dupes).toEqual(['paracetamol']);
  });

  it('no duplicates for Metformin + Omeprazole', () => {
    expect(
      findDuplicateGenerics([
        { brand: 'Comet', generic: 'Metformin Hydrochloride', strength: '500 mg', dosageForm: 'Tablet' },
        { brand: 'Seclo', generic: 'Omeprazole', strength: '20 mg', dosageForm: 'Capsule' },
      ]),
    ).toEqual([]);
  });
});

describe('brand spelling (edit distance against the database)', () => {
  it('exact spelling → no sign', () => {
    expect(checkBrandSpelling('Napa\nParacetamol 500 mg', 'Napa')).toBeNull();
    expect(checkBrandSpelling('SECLO 20 Capsule', 'Seclo')).toBeNull();
  });

  it('close but different spelling → sign with both spellings', () => {
    expect(checkBrandSpelling('Seclow 20 mg Capsule', 'Seclo')).toEqual({ code: 'brandSpelling', printed: 'Seclow', expected: 'Seclo' });
    expect(checkBrandSpelling('Maxprro 20', 'Maxpro')).toEqual({ code: 'brandSpelling', printed: 'Maxprro', expected: 'Maxpro' });
  });

  it('common OCR misreads are not signs (rn→m, 0→o, 1→l)', () => {
    expect(checkBrandSpelling('Secl0 20 mg', 'Seclo')).toBeNull();
    expect(checkBrandSpelling('rnonas 10', 'Monas')).toBeNull();
  });

  it('a completely different word or a very short brand cannot be judged', () => {
    expect(checkBrandSpelling('Paracetamol 500 mg', 'Seclo')).toBeNull();
    expect(checkBrandSpelling('Nap 500', 'Ace')).toBeNull();
  });
});

describe('manufacturer spelling', () => {
  it('core name ignores company suffixes', () => {
    expect(manufacturerCore('Beximco Pharmaceuticals Ltd.')).toBe('beximco');
    expect(manufacturerCore('Square Pharmaceuticals PLC')).toBe('square');
    expect(manufacturerCore('Incepta Pharmaceuticals Ltd.')).toBe('incepta');
  });

  it('exact → no sign; misspelt → sign; absent → no sign', () => {
    expect(checkManufacturerSpelling('Manufactured by Beximco Pharmaceuticals Ltd.', NAPA.manufacturer)).toBeNull();
    expect(checkManufacturerSpelling('Manufactured by Bexirnco Pharma', NAPA.manufacturer)).toBeNull(); // rn→m misread
    expect(checkManufacturerSpelling('Manufactured by Beximko Pharmaceuticals Ltd.', NAPA.manufacturer)).toEqual({
      code: 'manufacturerSpelling',
      printed: 'Beximko',
      expected: 'Beximco Pharmaceuticals Ltd.',
    });
    expect(checkManufacturerSpelling('Napa 500 mg', NAPA.manufacturer)).toBeNull();
    expect(checkManufacturerSpelling('anything', null)).toBeNull();
  });

  it('closestPrintedText compares runs of the same number of words', () => {
    expect(closestPrintedText('by Square Pharmaceuticals Ltd.', 'square pharmaceuticals')).toEqual({
      printed: 'Square Pharmaceuticals',
      distance: 0,
    });
  });
});

describe('batch and expiry presence', () => {
  it('missing batch', () => {
    expect(checkMissingBatch(null)).toEqual({ code: 'missingBatch' });
    expect(checkMissingBatch('2405123')).toBeNull();
  });
  it('missing expiry', () => {
    expect(checkMissingExpiry({ mfg: { year: 2025, month: 1 } })).toEqual({ code: 'missingExpiry' });
    expect(checkMissingExpiry({ exp: { year: 2027, month: 1 } })).toBeNull();
  });
});

describe('dates', () => {
  it('expiry before (or equal to) manufacture date', () => {
    expect(checkExpiryBeforeManufacture({ mfg: { year: 2025, month: 6 }, exp: { year: 2024, month: 1 } })).toEqual({
      code: 'expiryBeforeManufacture',
      mfg: '06/2025',
      exp: '01/2024',
    });
    expect(checkExpiryBeforeManufacture({ mfg: { year: 2025, month: 6 }, exp: { year: 2025, month: 6 } })?.code).toBe(
      'expiryBeforeManufacture',
    );
    expect(checkExpiryBeforeManufacture({ mfg: { year: 2025, month: 6 }, exp: { year: 2027, month: 5 } })).toBeNull();
    expect(checkExpiryBeforeManufacture({ exp: { year: 2027, month: 5 } })).toBeNull();
  });

  it('expired: MM/YYYY is valid until the end of that month', () => {
    expect(checkExpired({ exp: { year: 2026, month: 10 } }, TODAY)).toEqual({ code: 'expired', exp: '10/2026' });
    expect(checkExpired({ exp: { year: 2026, month: 11 } }, TODAY)).toBeNull(); // still November 2026
    expect(checkExpired({ exp: { year: 2026, month: 11, day: 16 } }, TODAY)?.code).toBe('expired');
    expect(checkExpired({}, TODAY)).toBeNull();
  });

  it('expiry status', () => {
    expect(expiryStatus({}, TODAY)).toEqual({ status: 'unknown' });
    expect(expiryStatus({ exp: { year: 2025, month: 12 } }, TODAY)).toMatchObject({ status: 'expired', exp: '12/2025' });
    expect(expiryStatus({ exp: { year: 2026, month: 11 } }, TODAY)).toMatchObject({ status: 'expiresSoon', daysLeft: 13 });
    expect(expiryStatus({ exp: { year: 2028, month: 4 } }, TODAY)).toMatchObject({ status: 'ok' });
  });
});

describe('printed price far below database price', () => {
  it('Napa 500 printed at Tk 0.30 per tablet vs Tk 0.80 → sign', () => {
    expect(checkPriceFarBelow(0.3, 0.8)).toEqual({ code: 'priceFarBelow', printedUnitPrice: 0.3, databaseUnitPrice: 0.8 });
  });
  it('higher or similar printed prices are not signs (database prices are from 2021)', () => {
    expect(checkPriceFarBelow(1.2, 0.8)).toBeNull();
    expect(checkPriceFarBelow(0.5, 0.8)).toBeNull();
  });
  it('no comparison without both prices', () => {
    expect(checkPriceFarBelow(null, 0.8)).toBeNull();
    expect(checkPriceFarBelow(0.3, null)).toBeNull();
  });
});

describe('findSuspiciousSigns — whole packs', () => {
  const check = (text: string, product = NAPA) => {
    const r = readPack(text);
    return findSuspiciousSigns({
      text,
      batch: r.batch,
      dates: r.dates,
      printedUnitPrice: printedUnitPrice(r.price),
      product,
      today: TODAY,
    });
  };

  it('a normal Napa pack → no suspicious signs', () => {
    const text = `Napa\nParacetamol BP 500 mg\nBeximco Pharmaceuticals Ltd.\nBatch No.: 2405123\nMfg. Date: 05/2024 Exp. Date: 04/2027\nMRP Tk. 1.20 per Tablet`;
    expect(check(text)).toEqual([]);
  });

  it('a pack with several problems lists every sign, never a verdict', () => {
    const text = `Seclow 20\nOmeprazole 20 mg Capsule\nSqaure Pharmaceuticals Ltd.\nMfg. Date: 06/2025 Exp. Date: 01/2024\nMRP Tk. 1.00 per capsule`;
    const signs = check(text, SECLO);
    expect(signs.map((s) => s.code)).toEqual([
      'brandSpelling',
      'manufacturerSpelling',
      'missingBatch',
      'expiryBeforeManufacture',
      'expired',
      'priceFarBelow',
    ]);
    for (const s of signs) expect(JSON.stringify(s)).not.toMatch(/fake|genuine|counterfeit/i);
  });

  it('no expiry read is not a suspicious sign (the date may be on another side or unreadable)', () => {
    expect(check('Napa\nBeximco Pharmaceuticals Ltd.\nBatch No. 24A12').map((s) => s.code)).toEqual([]);
  });
});
