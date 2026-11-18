import Database from 'better-sqlite3';
import { beforeAll, describe, expect, it } from 'vitest';
import { editDistance, foldOcrConfusions, maxTypos, rankKeys, rankKeysWithVariants } from '@/lib/medicine/fuzzy';
import { bestUnitPrice, cleanText, formKey, nameKey, parsePackQuantity, parsePacks, strengthKey } from '@/lib/medicine/normalise';
import { findAlternatives, getDataInfo, searchBrands } from '@/lib/medicine/repo';
import { MEDICINE_INDEXES, MEDICINE_SCHEMA } from '@/lib/medicine/schema';

describe('normalise', () => {
  it('cleans text and the dataset NULL marker', () => {
    expect(cleanText('  Napa   EXTRA ')).toBe('Napa EXTRA');
    expect(cleanText('NULL')).toBe('');
    expect(nameKey('Napa-Extra 500')).toBe('napa extra 500');
  });

  it('strength keys only change formatting', () => {
    expect(strengthKey('125 mg/5 ml')).toBe('125mg/5ml');
    expect(strengthKey('1 gm')).toBe('1g');
    expect(strengthKey('5.0mg')).toBe('5mg');
    expect(strengthKey('500mg')).not.toBe(strengthKey('0.5g')); // no unit conversion
    expect(strengthKey('NULL')).toBe('');
  });

  it('form keys unify spelling variants only', () => {
    expect(formKey('Powder For Suspension')).toBe(formKey('Powder for suspension'));
    expect(formKey('E/E Drops')).toBe('eye/ear drops');
    expect(formKey('Syrup')).not.toBe(formKey('Suspension'));
  });

  it.each([
    ["500's pack", 500, 'piece'],
    ["10x10's pack", 100, 'piece'],
    ['60"s', 60, 'piece'],
    ["40mg vial X 1's pack", 1, 'piece'],
    ['5 amps pack', 5, 'piece'],
    ['60ml bot', 60, 'ml'],
    ['15 ml bot', 15, 'ml'],
    ['10gm  tube', 10, 'g'],
    ['200 doses unit', 200, 'dose'],
    ['120 sprays', 120, 'dose'],
    ['500mg vial with water', 1, 'piece'],
  ])('pack size %s → %d %s', (label, quantity, unit) => {
    expect(parsePackQuantity(label)).toEqual({ quantity, unit });
  });

  it('pairs multi-option prices with pack sizes (Napa syrup)', () => {
    const packs = parsePacks('18.24 / 20.63 / 31.77', '50ml bot/60ml bot/100ml bot');
    expect(packs.map((p) => [p.price, p.quantity, p.unit])).toEqual([
      [18.24, 50, 'ml'],
      [20.63, 60, 'ml'],
      [31.77, 100, 'ml'],
    ]);
    expect(bestUnitPrice(packs)).toEqual({ unitPrice: 0.3177, unit: 'ml' });
  });

  it('Napa 500 mg tablet: Tk 400 for 500 → Tk 0.80 each', () => {
    expect(bestUnitPrice(parsePacks('400', "500's pack"))).toEqual({ unitPrice: 0.8, unit: 'piece' });
  });

  it('missing prices and mismatched options', () => {
    expect(parsePacks('NULL', "30's pack")).toEqual([]);
    expect(parsePacks('90 / 180', "30's pack")[1]).toMatchObject({ price: 180, quantity: null, unitPrice: null });
  });
});

describe('fuzzy', () => {
  it('edit distance with adjacent swaps', () => {
    expect(editDistance('napa', 'napa')).toBe(0);
    expect(editDistance('napa', 'nopa')).toBe(1);
    expect(editDistance('seclo', 'sceol')).toBe(2);
    expect(editDistance('maxpro', 'mxapro')).toBe(1);
    expect(editDistance('', 'ace')).toBe(3);
  });

  it('allowed typos grow with length', () => {
    expect([3, 4, 6, 12].map(maxTypos)).toEqual([0, 1, 2, 3]);
  });

  it('folds OCR confusions', () => {
    expect(foldOcrConfusions('rnonas')).toBe('monas');
    expect(foldOcrConfusions('secl0')).toBe('seclo');
    expect(foldOcrConfusions('f1ucloxacillin')).toBe('flucloxacillin');
    expect(foldOcrConfusions('napa 500')).toBe('napa 500');
  });

  const keys = ['napa', 'napa extra', 'nopain', 'seclo', 'seclo dr', 'monas', 'ace', 'maxpro'];

  it('ranks exact, then typos and short prefixes', () => {
    expect(rankKeys('napa', keys).map((r) => r.key).slice(0, 2)).toEqual(['napa', 'napa extra']);
    expect(rankKeys('nopa', keys).map((r) => r.key)).toContain('napa');
    expect(rankKeys('zzzz', keys)).toEqual([]);
  });

  it('variants handle brand+strength and OCR misreads', () => {
    expect(rankKeysWithVariants('napa500', keys)[0]).toEqual({ key: 'napa', score: 0 });
    expect(rankKeysWithVariants('rnonas', keys)[0]).toEqual({ key: 'monas', score: 0 });
  });
});

describe('repo (fixture database)', () => {
  const db = new Database(':memory:');

  beforeAll(() => {
    db.exec(MEDICINE_SCHEMA);
    db.exec(MEDICINE_INDEXES);
    db.prepare('INSERT INTO meta VALUES (?, ?)').run('data_last_updated', '2021-09');
    db.prepare('INSERT INTO meta VALUES (?, ?)').run('source_name', 'medicinedb (WSAyan)');
    db.prepare('INSERT INTO generics VALUES (?, ?, ?, ?, ?, ?)').run(1, 'Paracetamol', 'paracetamol', 'Mild to moderate pain and fever', 'Non-opioid analgesics', 'B');
    db.prepare('INSERT INTO generics VALUES (?, ?, ?, ?, ?, ?)').run(2, 'Omeprazole', 'omeprazole', 'Peptic ulcer', 'Proton pump inhibitor', 'C');
    const ins = db.prepare('INSERT INTO products VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    const add = (id: number, brand: string, g: number, gk: string, maker: string, form: string, strength: string, price: number | null, unit: string | null) =>
      ins.run(id, brand, nameKey(brand), g, gk, null, maker, form, formKey(form), strength, strengthKey(strength), price, unit, '[]');
    add(1, 'Napa', 1, 'paracetamol', 'Beximco Pharmaceuticals Ltd.', 'Tablet', '500mg', 0.8, 'piece');
    add(2, 'Ace', 1, 'paracetamol', 'Square Pharmaceuticals Ltd.', 'Tablet', '500 mg', 0.8, 'piece');
    add(3, 'Pyramol', 1, 'paracetamol', 'Opsonin', 'Tablet', '500mg', 0.4, 'piece');
    add(4, 'Reset', 1, 'paracetamol', 'Incepta', 'Tablet', '500mg', 0.6, 'piece');
    add(5, 'Napa Extend', 1, 'paracetamol', 'Beximco', 'Tablet', '665mg', 1.5, 'piece'); // different strength
    add(6, 'Napa', 1, 'paracetamol', 'Beximco', 'Syrup', '120mg/5ml', 0.34, 'ml'); // different form
    add(7, 'Xpara', 1, 'paracetamol', 'X', 'Tablet', '500mg', null, null); // no price
    add(8, 'Seclo', 2, 'omeprazole', 'Square', 'Capsule', '20mg', 5, 'piece');
    add(9, 'Napa', 1, 'paracetamol', 'Beximco', 'Tablet', '', 0.8, 'piece'); // unknown strength
    add(10, 'Napa', 1, 'paracetamol', 'Beximco', 'Tablet', '650mg', 0.9, 'piece'); // same brand, other strength
  });

  it('search groups products by brand, best match first, with generic and use', () => {
    const r = searchBrands(db, 'Nopa');
    expect(r[0]!.brand).toBe('Napa');
    const tab = r[0]!.products.find((p) => p.form === 'Tablet' && p.strength === '500mg')!;
    expect(tab).toMatchObject({ generic: 'Paracetamol', indication: 'Mild to moderate pain and fever', unitPrice: 0.8, pregnancyCategory: 'B' });
  });

  it('safety rule 10: alternatives match generic AND strength AND form exactly, cheapest first', () => {
    const r = findAlternatives(db, 1);
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.alternatives.map((a) => [a.brand, a.unitPrice, a.cheaper])).toEqual([
      ['Pyramol', 0.4, true],
      ['Reset', 0.6, true],
      ['Ace', 0.8, false], // "500 mg" == "500mg" after normalisation
    ]);
    expect(r.alternatives.every((a) => a.generic === 'Paracetamol' && a.form === 'Tablet')).toBe(true);
  });

  it('never compares when strength, generic or price is unknown', () => {
    expect(findAlternatives(db, 9)).toMatchObject({ status: 'not_comparable', reason: 'strength_unknown' });
    expect(findAlternatives(db, 7)).toMatchObject({ status: 'not_comparable', reason: 'price_unknown' });
    expect(findAlternatives(db, 999)).toEqual({ status: 'not_found' });
  });

  it('a product with no other brand has no alternatives', () => {
    expect(findAlternatives(db, 8)).toMatchObject({ status: 'ok', alternatives: [] });
  });

  it('exposes the data date', () => {
    expect(getDataInfo(db)).toMatchObject({ lastUpdated: '2021-09', sourceName: 'medicinedb (WSAyan)' });
  });
});
