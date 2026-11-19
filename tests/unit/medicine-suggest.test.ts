import Database from 'better-sqlite3';
import { beforeAll, describe, expect, it } from 'vitest';
import { formKey, nameKey, strengthKey } from '@/lib/medicine/normalise';
import { genericOnlyProduct, nameIndex, searchBrandsAndGenerics } from '@/lib/medicine/repo';
import { MEDICINE_INDEXES, MEDICINE_SCHEMA } from '@/lib/medicine/schema';
import { aliasKeys, banglaToLatin, buildNameIndex, closestName, hasBangla, phoneticKey, suggestNames, type NameEntry } from '@/lib/medicine/suggest';
import { parseRxText } from '@/lib/ocr/prescription';

// A small Bangladeshi medicine list (brands with their generics, plus generics).
const ENTRIES: NameEntry[] = [
  { name: 'Napa', kind: 'brand', generic: 'Paracetamol' },
  { name: 'Napa Extra', kind: 'brand', generic: 'Paracetamol + Caffeine' },
  { name: 'Ace', kind: 'brand', generic: 'Paracetamol' },
  { name: 'Seclo', kind: 'brand', generic: 'Omeprazole' },
  { name: 'Comet', kind: 'brand', generic: 'Metformin Hydrochloride' },
  { name: 'Metfo', kind: 'brand', generic: 'Metformin Hydrochloride' },
  { name: 'Rosuva', kind: 'brand', generic: 'Rosuvastatin' },
  { name: 'Clopid', kind: 'brand', generic: 'Clopidogrel' },
  { name: 'Ceclor', kind: 'brand', generic: 'Cefaclor' },
  { name: 'Paracetamol', kind: 'generic', generic: 'Paracetamol', genericId: 1 },
  { name: 'Paracetamol + Caffeine', kind: 'generic', generic: 'Paracetamol + Caffeine', genericId: 2 },
  { name: 'Omeprazole', kind: 'generic', generic: 'Omeprazole', genericId: 3 },
  { name: 'Metformin Hydrochloride', kind: 'generic', generic: 'Metformin Hydrochloride', genericId: 4 },
  { name: 'Rosuvastatin', kind: 'generic', generic: 'Rosuvastatin', genericId: 5 },
];
const index = buildNameIndex(ENTRIES);
const names = (q: string) => suggestNames(q, index).map((s) => s.name);

describe('Bangla-friendly helpers', () => {
  it('detects Bangla script', () => {
    expect(hasBangla('নাপা')).toBe(true);
    expect(hasBangla('Napa 500')).toBe(false);
  });

  it('transliterates Bangla medicine names into Latin readings', () => {
    expect(banglaToLatin('নাপা')).toEqual(['napa']);
    expect(banglaToLatin('প্যারাসিটামল')).toContain('parasitamol');
    expect(banglaToLatin('মেটফরমিন')).toContain('metfrmin');
    expect(banglaToLatin('সেকলো')).toContain('seklo');
    expect(banglaToLatin('৫০০')).toEqual(['500']);
  });

  it('phonetic keys make Bangla readings and Latin spellings meet', () => {
    expect(phoneticKey('paracetamol')).toBe(phoneticKey('parasitamol'));
    expect(phoneticKey('Seclo')).toBe(phoneticKey('seklo'));
    expect(phoneticKey('Ceclor')).not.toBe(phoneticKey('Seclo'));
  });

  it('a salt-free alias lets "metformin" find Metformin Hydrochloride, but not for combinations', () => {
    expect(aliasKeys('Metformin Hydrochloride')).toEqual(['metformin hydrochloride', 'metformin']);
    expect(aliasKeys('Paracetamol + Caffeine')).toEqual(['paracetamol caffeine']);
  });
});

describe('autocomplete (2+ letters, brand and generic)', () => {
  it('needs at least 2 letters', () => {
    expect(names('n')).toEqual([]);
    expect(names('na')).toEqual(['Napa', 'Napa Extra']);
  });

  it('finds brands and generics by prefix', () => {
    expect(names('nap')[0]).toBe('Napa');
    expect(names('parac')).toEqual(['Paracetamol', 'Paracetamol + Caffeine']);
    const met = suggestNames('metf', index);
    expect(met.map((s) => [s.name, s.kind])).toEqual(
      expect.arrayContaining([
        ['Metfo', 'brand'],
        ['Metformin Hydrochloride', 'generic'],
      ]),
    );
  });

  it('a brand carries its generic', () => {
    expect(suggestNames('sec', index)[0]).toMatchObject({ name: 'Seclo', kind: 'brand', generic: 'Omeprazole' });
  });

  it('tolerates typos while typing', () => {
    expect(names('Metfrmin')[0]).toBe('Metformin Hydrochloride');
    expect(names('omiprazol')[0]).toBe('Omeprazole');
  });

  it('accepts names typed in Bangla', () => {
    expect(names('নাপা')[0]).toBe('Napa');
    expect(names('প্যারাসিটামল')[0]).toBe('Paracetamol');
    expect(names('সেকলো')[0]).toBe('Seclo');
    expect(names('মেটফরমিন')).toContain('Metformin Hydrochloride');
    expect(names('কমেট')[0]).toBe('Comet');
  });
});

describe('closest name for OCR text', () => {
  it.each([
    ['Metfrmin', 'Metformin Hydrochloride'],
    ['Secl0', 'Seclo'],
    ['Rosuva', 'Rosuva'],
    ['Nopa', 'Napa'],
    ['Napa500', 'Napa'],
    ['Omiprazol', 'Omeprazole'],
    ['Clopld', 'Clopid'],
  ])('%s → %s', (read, expected) => {
    expect(closestName(read, index)?.name).toBe(expected);
  });

  it('exact names score 0', () => {
    expect(closestName('Comet', index)).toMatchObject({ name: 'Comet', score: 0, generic: 'Metformin Hydrochloride' });
  });

  it('does not force a match on other words or short fragments', () => {
    expect(closestName('Rahima', index)).toBeNull();
    expect(closestName('Begum', index)).toBeNull();
    expect(closestName('Mirpur', index)).toBeNull();
    expect(closestName('mg', index)).toBeNull();
    expect(closestName('Na', index)).toBeNull();
  });
});

describe('prescription OCR lines', () => {
  it('splits printed lines into name, strength, frequency and duration', () => {
    const text = [
      'Name: Rahima Begum Age: 52 Mobile: 01712-345678',
      'Dx: Type 2 DM, Dyslipidaemia',
      'Rx',
      'Tab. Comet 500 mg — 1+0+1 — 30 days',
      'Tab. Rosuva 10mg 0+0+1 30 days',
      'Cap. Secl0 20 mg — 1+0+1 — 14 days',
      'Tab. Metfrmin 500 mg bd 1 month',
      'Syr. Napa 120 mg/5 ml 1+1+1 5 days',
      'Advice: walk 30 minutes daily',
    ].join('\n');
    expect(parseRxText(text)).toEqual([
      { name: 'Comet', strength: '500 mg', frequency: '1+0+1', duration: '30 days' },
      { name: 'Rosuva', strength: '10mg', frequency: '0+0+1', duration: '30 days' },
      { name: 'Seclo', strength: '20 mg', frequency: '1+0+1', duration: '14 days' },
      { name: 'Metfrmin', strength: '500 mg', frequency: 'bd', duration: '1 month' },
      { name: 'Napa', strength: '120 mg/5 ml', frequency: '1+1+1', duration: '5 days' },
    ]);
  });

  it('skips header, diagnosis and advice lines', () => {
    expect(parseRxText('Name: Karim\nMobile: 01712345678\nDx: Hypertension\nAdvice: less salt')).toEqual([]);
  });
});

describe('database: suggestions and generic-name matches', () => {
  const db = new Database(':memory:');
  beforeAll(() => {
    db.exec(MEDICINE_SCHEMA);
    db.exec(MEDICINE_INDEXES);
    db.prepare('INSERT INTO generics VALUES (?, ?, ?, ?, ?, ?)').run(1, 'Paracetamol', 'paracetamol', 'Pain and fever', 'Analgesic', 'B');
    db.prepare('INSERT INTO generics VALUES (?, ?, ?, ?, ?, ?)').run(2, 'Metformin Hydrochloride', 'metformin hydrochloride', 'Type 2 diabetes', 'Biguanide', 'B');
    const ins = db.prepare('INSERT INTO products VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    const add = (id: number, brand: string, g: number, gk: string, strength: string) =>
      ins.run(id, brand, nameKey(brand), g, gk, null, 'Maker', 'Tablet', formKey('Tablet'), strength, strengthKey(strength), 1, 'piece', '[]');
    add(1, 'Napa', 1, 'paracetamol', '500mg');
    add(2, 'Comet', 2, 'metformin hydrochloride', '500mg');
    add(3, 'Comet', 2, 'metformin hydrochloride', '850mg');
  });

  it('indexes each brand once, with its generic, plus every generic', () => {
    const entries = nameIndex(db).entries.map((e) => [e.name, e.kind, e.generic]);
    expect(entries).toEqual(
      expect.arrayContaining([
        ['Napa', 'brand', 'Paracetamol'],
        ['Comet', 'brand', 'Metformin Hydrochloride'],
        ['Metformin Hydrochloride', 'generic', 'Metformin Hydrochloride'],
      ]),
    );
    expect(entries.filter((e) => e[0] === 'Comet')).toHaveLength(1);
  });

  it('a generic typed by name gives a generic-only match first, so the line can still be checked', () => {
    const r = searchBrandsAndGenerics(db, 'metformin');
    expect(r[0]).toMatchObject({ brand: 'Metformin Hydrochloride', genericOnly: true });
    expect(r[0]!.products[0]).toMatchObject({ id: -2, generic: 'Metformin Hydrochloride', genericOnly: true, unitPrice: null, strength: '' });
  });

  it('brands still come first for a brand name; Bangla script finds the brand', () => {
    expect(searchBrandsAndGenerics(db, 'Napa')[0]!.brand).toBe('Napa');
    expect(searchBrandsAndGenerics(db, 'কমেট')[0]).toMatchObject({ brand: 'Comet' });
    expect(genericOnlyProduct(db, 99)).toBeNull();
  });
});

describe('generic names are not crowded out by many brands', () => {
  it('keeps room for the generic when 8+ brands share the prefix', () => {
    const many: NameEntry[] = [
      ...['Metfo', 'Metfar', 'Metfen', 'Metfil', 'Metform', 'Metfo XR', 'Metfar SR', 'Metformin', 'Metfast'].map((name): NameEntry => ({ name, kind: 'brand', generic: 'Metformin Hydrochloride' })),
      { name: 'Metformin Hydrochloride', kind: 'generic', generic: 'Metformin Hydrochloride', genericId: 1 },
    ];
    const list = suggestNames('metf', buildNameIndex(many), 8);
    expect(list).toHaveLength(8);
    expect(list.filter((s) => s.kind === 'generic').map((s) => s.name)).toEqual(['Metformin Hydrochloride']);
    expect(list.filter((s) => s.kind === 'brand')).toHaveLength(7);
  });
});

describe('OCR matching is not affected by the generic places', () => {
  it('an exact brand read by OCR stays the match even when a generic is similar', () => {
    const idx = buildNameIndex([
      { name: 'Clopid', kind: 'brand', generic: 'Clopidogrel' },
      { name: 'Clopidogrel', kind: 'generic', generic: 'Clopidogrel', genericId: 1 },
      { name: 'Cloxid', kind: 'generic', generic: 'Cloxid', genericId: 2 },
    ]);
    expect(closestName('Clopid', idx)).toMatchObject({ name: 'Clopid', kind: 'brand', score: 0 });
  });
});
