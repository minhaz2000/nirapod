import Database from 'better-sqlite3';
import { beforeAll, describe, expect, it } from 'vitest';
import { identifyPack, ingredientWords, type PackEvidence } from '@/lib/medicine/identify';
import { formKey, nameKey, strengthKey } from '@/lib/medicine/normalise';
import { productsByBrandKey } from '@/lib/medicine/repo';
import { MEDICINE_INDEXES, MEDICINE_SCHEMA } from '@/lib/medicine/schema';
import { brandCandidates, evidenceFromReading, mergeReadings, phrasesFromLine, readPack, readingFromVision, type VisionPackFields } from '@/lib/ocr/pack';
import { closestPrintedText, checkBrandSpelling } from '@/lib/rules/medicine';

// A small slice of the Bangladeshi medicine database, including the brands that used to win for "No Pain".
const db = new Database(':memory:');
beforeAll(() => {
  db.exec(MEDICINE_SCHEMA);
  db.exec(MEDICINE_INDEXES);
  const gen = db.prepare('INSERT INTO generics VALUES (?, ?, ?, ?, ?, ?)');
  const generics = ['Diclofenac Sodium', 'Diclofenac Potassium', 'Diclofenac Sodium 0.1% Eye prep', 'Aceclofenac', 'Paracetamol', 'Omeprazole', 'Ketorolac Tromethamine'];
  generics.forEach((g, i) => gen.run(i + 1, g, nameKey(g), null, null, null));
  const ins = db.prepare('INSERT INTO products VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  let id = 0;
  const add = (brand: string, generic: string, maker: string, form: string, strength: string) => {
    const g = generics.indexOf(generic) + 1;
    ins.run(++id, brand, nameKey(brand), g, nameKey(generic), null, maker, form, formKey(form), strength, strengthKey(strength), 1, 'piece', '[]');
  };
  add('Nopain', 'Diclofenac Sodium', 'Drug International Ltd.', 'Tablet', '25mg');
  add('Nopain', 'Diclofenac Potassium', 'Drug International Ltd.', 'Tablet', '50mg');
  add('Nopain', 'Diclofenac Sodium 0.1% Eye prep', 'Drug International Ltd.', 'Eye Drops', '');
  add('Paino', 'Aceclofenac', 'Some Pharma Ltd.', 'Tablet', '100mg');
  add('Painex', 'Aceclofenac', 'Other Pharma Ltd.', 'Tablet', '100mg');
  add('Pair', 'Ketorolac Tromethamine', 'Drug International Ltd.', 'Tablet', '10mg');
  add('Diclofenac', 'Diclofenac Sodium', 'Generic Labs Ltd.', 'Tablet', '50 mg');
  add('Napa', 'Paracetamol', 'Beximco Pharmaceuticals Ltd.', 'Tablet', '500mg');
  add('Napa', 'Paracetamol', 'Beximco Pharmaceuticals Ltd.', 'Tablet', '650mg');
  add('Napa', 'Paracetamol', 'Beximco Pharmaceuticals Ltd.', 'Syrup', '120mg/5ml');
  add('Seclo', 'Omeprazole', 'Square Pharmaceuticals Ltd.', 'Capsule', '20mg');
});

const identify = (e: PackEvidence) => identifyPack(db, e, (k) => productsByBrandKey(db, k));

/** What on-phone OCR reads from the No Pain pack front: stylised two-word brand as the largest line. */
const NO_PAIN_LINES = [
  { text: 'No Pain', height: 150, confidence: 88 },
  { text: 'Diclofenac Potassium BP 50 mg', height: 45, confidence: 92 },
  { text: 'Tablet', height: 44, confidence: 95 },
  { text: 'Rx only', height: 34, confidence: 90 },
  { text: 'Fast relief from pain', height: 33, confidence: 85 },
  { text: 'Drug International Ltd.', height: 30, confidence: 91 },
];
const NO_PAIN_TEXT = NO_PAIN_LINES.map((l) => l.text).join('\n');

describe('brand phrases (cause of the "No Pain" bug)', () => {
  it('keeps two-word brands whole, largest text first', () => {
    expect(brandCandidates([], NO_PAIN_TEXT, 8, NO_PAIN_LINES).slice(0, 3)).toEqual(['No Pain', 'Pain', 'Diclofenac Potassium']);
  });
  it('splits a line at pack words and keeps short words only inside phrases', () => {
    expect(phrasesFromLine('Tab. Napa Extra 500 mg')).toEqual(['Napa Extra', 'Napa', 'Extra']);
    expect(phrasesFromLine('No Pain')).toEqual(['No Pain', 'Pain']);
    expect(phrasesFromLine('Manufactured by Drug International Ltd.')).toContain('Drug International');
  });
});

describe('identify: No Pain regression', () => {
  it('OCR of the No Pain pack returns Nopain 50 mg (Diclofenac Potassium), not Paino / Diclofenac Sodium', () => {
    const r = identify(evidenceFromReading(readPack(NO_PAIN_TEXT, [], NO_PAIN_LINES)));
    expect(r.verdict).toBe('strong');
    expect(r.best?.product).toMatchObject({ brand: 'Nopain', strength: '50mg', generic: 'Diclofenac Potassium' });
    expect(r.best?.checks).toEqual({ generic: 'match', strength: 'match', form: 'match', manufacturer: 'match' });
    // The log explains why the others lost.
    expect(r.log.join('\n')).toMatch(/Paino .*contradicts the pack/);
    expect(r.log.join('\n')).toMatch(/Nopain 25mg Tablet \(Diclofenac Sodium\).*generic contradicts/);
    expect(r.log.at(-1)).toMatch(/^verdict: strong/);
  });

  it('the vision model\'s answer is verified the same way', () => {
    const r = identify({ source: 'vision', brandTexts: ['No Pain'], generic: 'Diclofenac Potassium BP', strength: '50 mg', form: 'Tablet', manufacturer: 'Drug International Ltd.', text: NO_PAIN_TEXT });
    expect(r.verdict).toBe('strong');
    expect(r.best?.product.strength).toBe('50mg');
  });

  it('a candidate that contradicts the pack loses, even with a perfect brand match', () => {
    // The model says "Nopain", but the pack says Eye Drops: the tablets contradict, the eye drops win.
    const r = identify({ source: 'vision', brandTexts: ['Nopain'], form: 'Eye Drops', text: 'Nopain\nDiclofenac Sodium 0.1%\nSterile eye drops' });
    expect(r.best?.product.form).toBe('Eye Drops');
    expect(r.candidates.filter((c) => c.contradicts).every((c) => c.product.form === 'Tablet')).toBe(true);
  });

  it('the model is never trusted on its own: a brand with no printed detail agreeing is only weak', () => {
    const r = identify({ source: 'vision', brandTexts: ['Nopain'], text: 'Nopain' });
    expect(r.verdict).toBe('weak');
  });

  it('"No Pain" printed for the database brand "Nopain" is not a spelling sign', () => {
    expect(closestPrintedText(NO_PAIN_TEXT, 'Nopain')?.distance).toBe(0);
    expect(checkBrandSpelling(NO_PAIN_TEXT, 'Nopain')).toBeNull();
    expect(closestPrintedText('Drug International Ltd.', 'international')?.distance).toBe(0); // "rn" is not "m" here
  });
});

describe('identify: weak and not found', () => {
  it('weak: the brand matches but nothing printed says which strength → top candidates to choose from', () => {
    const r = identify({ source: 'ocr', brandTexts: ['Napa'], text: 'Napa\nParacetamol\nBeximco Pharmaceuticals Ltd.' });
    expect(r.verdict).toBe('weak');
    expect(r.candidates.length).toBeGreaterThanOrEqual(2);
    expect(r.candidates.length).toBeLessThanOrEqual(3);
    expect(r.candidates.every((c) => c.product.brand === 'Napa')).toBe(true);
  });

  it('weak: a misread brand with no other detail', () => {
    const r = identify({ source: 'ocr', brandTexts: ['Secla'], text: 'Secla' });
    expect(r.verdict).toBe('weak');
    expect(r.candidates[0]?.product.brand).toBe('Seclo');
  });

  it('strong: Napa 500 mg tablet when the strength and form are printed', () => {
    const r = identify({ source: 'ocr', brandTexts: ['Napa'], text: 'Napa\nParacetamol BP 500 mg\nTablet\nBeximco Pharmaceuticals Ltd.' });
    expect(r.verdict).toBe('strong');
    expect(r.best?.product.strength).toBe('500mg');
  });

  it('none: a medicine that is not in the database', () => {
    const r = identify({ source: 'vision', brandTexts: ['Zyxorin'], generic: 'Zyxoridine', strength: '20 mg', form: 'Capsule', text: 'Zyxorin\nZyxoridine 20 mg\nCapsule' });
    expect(r.verdict).toBe('none');
    expect(r.best).toBeNull();
  });

  it('none: only contradicting candidates', () => {
    const r = identify({ source: 'ocr', brandTexts: ['Pain'], text: 'Pain\nIbuprofen 400 mg\nTablet' });
    expect(r.verdict === 'none' || r.candidates.every((c) => !c.contradicts)).toBe(true);
  });

  it('ingredient words ignore salts', () => {
    expect(ingredientWords('Diclofenac Sodium + Misoprostol')).toEqual(['diclofenac', 'misoprostol']);
    expect(ingredientWords(null)).toEqual([]);
  });
});

const VISION: VisionPackFields = {
  brand: 'No Pain', generic: 'Diclofenac Potassium BP', strength: '50 mg', dosage_form: 'Tablet', manufacturer: 'Drug International Ltd.',
  expiry_date: '', manufacturing_date: '', batch_number: '', dar_number: '', visible_text: NO_PAIN_TEXT,
};

describe('readings from the vision model and the back of the pack', () => {
  it('takes labelled dates only; an unlabelled date in the text is never the expiry', () => {
    expect(readingFromVision({ ...VISION, visible_text: `${NO_PAIN_TEXT}\n08/2027` }).dates).toEqual({});
    expect(readingFromVision({ ...VISION, expiry_date: '08-2027' }).dates).toEqual({ exp: { month: 8, year: 2027 } });
    expect(readingFromVision({ ...VISION, expiry_date: 'AUG 27', manufacturing_date: 'SEP 25' }).dates).toEqual({ mfg: { month: 9, year: 2025 }, exp: { month: 8, year: 2027 } });
    expect(readingFromVision({ ...VISION, expiry_date: 'unreadable' }).dates).toEqual({});
  });

  it('the labelled transcription wins over the fields (MFG never becomes EXP)', () => {
    const r = readingFromVision({ ...VISION, visible_text: 'No Pain\nMfg. Date: 03/2025\nExp. Date: 02/2027', expiry_date: '03/2025' });
    expect(r.dates).toEqual({ mfg: { month: 3, year: 2025 }, exp: { month: 2, year: 2027 } });
  });

  it('keeps the model brand first, fields for cross-checking, batch and DAR', () => {
    const r = readingFromVision({ ...VISION, batch_number: 'NP2503', dar_number: '076-123-045' });
    expect(r.brandCandidates[0]).toBe('No Pain');
    expect(r).toMatchObject({ source: 'vision', batch: 'NP2503', registration: '076-123-045', fields: { strength: '50 mg', form: 'Tablet' } });
    expect(evidenceFromReading(r)).toMatchObject({ source: 'vision', generic: 'Diclofenac Potassium BP', strength: '50 mg' });
  });

  it('merging the back adds the expiry, batch and DAR number; the front stays first', () => {
    const front = readPack(NO_PAIN_TEXT, [], NO_PAIN_LINES);
    const back = readPack('Batch No.: NP2503\nMfg. Date: 03/2025\nExp. Date: 02/2027\nDAR No.: 076-123-045');
    const m = mergeReadings(front, back);
    expect(m.dates).toEqual({ mfg: { month: 3, year: 2025 }, exp: { month: 2, year: 2027 } });
    expect(m.batch).toBe('NP2503');
    expect(m.brandCandidates[0]).toBe('No Pain');
    expect(front.dates).toEqual({}); // the front alone has no expiry: "not readable", never guessed
  });
});

describe('unreadable OCR: no unrelated candidates', () => {
  it('only a weak look-alike brand and nothing printed agreeing → none, with no candidates offered', () => {
    const r = identify({ source: 'ocr', brandTexts: ['Pain'], text: 'Pain' });
    expect(r.verdict).toBe('none');
    expect(r.candidates).toEqual([]);
  });
});
