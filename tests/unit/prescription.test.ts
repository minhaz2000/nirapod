import { describe, expect, it } from 'vitest';
import {
  checkPrescription,
  coreIngredient,
  findAllergies,
  findDuplicateIngredients,
  findInteractions,
  findPregnancyFlags,
  ingredients,
  relateReportToPrescription,
  type ConfirmedMedicine,
} from '@/lib/rules/prescription';
import { checkReport } from '@/lib/rules/report-ranges';
import { parseReport } from '@/lib/ocr/report';

let n = 0;
const med = (brand: string, generic: string | null, pregnancyCategory: string | null = null): ConfirmedMedicine => ({
  lineId: String(++n),
  brand,
  generic,
  strength: '',
  form: 'Tablet',
  frequency: '',
  duration: '',
  pregnancyCategory,
});

const NAPA = med('Napa', 'Paracetamol', 'B');
const ACE = med('Ace', 'Paracetamol', 'B');
const NAPA_EXTRA = med('Napa Extra', 'Paracetamol + Caffeine', 'C');
const COMET = med('Comet', 'Metformin Hydrochloride', 'B');
const GLUCOMET_XR = med('Glucomet XR', 'Metformin Hydrochloride Extended Release', 'B');
const ROSUVA = med('Rosuva', 'Rosuvastatin', 'X');
const SECLO = med('Seclo', 'Omeprazole', 'C');
const CLOPID = med('Clopid', 'Clopidogrel', 'B');
const WARIN = med('Warin', 'Warfarin Sodium', 'X');
const CLOFENAC = med('Clofenac', 'Diclofenac Sodium', 'C');
const NAPROSYN = med('Naprosyn', 'Naproxen', 'C');
const MOXACIL = med('Moxacil', 'Amoxicillin Trihydrate', 'B');
const SILDENA = med('Sildena', 'Sildenafil Citrate', 'B');
const NIDOCARD = med('Nidocard', 'Glyceryl Trinitrate', 'C');

describe('ingredients', () => {
  it('splits combinations and normalises', () => {
    expect(ingredients('Paracetamol + Caffeine')).toEqual(['paracetamol', 'caffeine']);
    expect(ingredients(null)).toEqual([]);
    expect(coreIngredient('metformin hydrochloride')).toBe('metformin');
    expect(coreIngredient('amoxicillin trihydrate')).toBe('amoxicillin');
  });
});

describe('same generic twice (double dose)', () => {
  it('Napa + Ace are both paracetamol', () => {
    expect(findDuplicateIngredients([NAPA, ACE, COMET])).toEqual([{ code: 'duplicateIngredient', ingredient: 'paracetamol', brands: ['Napa', 'Ace'] }]);
  });
  it('a combination product counts too (Napa Extra + Ace)', () => {
    expect(findDuplicateIngredients([NAPA_EXTRA, ACE])[0]).toMatchObject({ ingredient: 'paracetamol', brands: ['Napa Extra', 'Ace'] });
  });
  it('salt and release forms of metformin are the same ingredient', () => {
    expect(findDuplicateIngredients([COMET, GLUCOMET_XR])[0]).toMatchObject({ ingredient: 'metformin', brands: ['Comet', 'Glucomet XR'] });
    expect(findDuplicateIngredients([COMET, med('Diabex', 'Metformin Hydrochloride')])[0]).toMatchObject({ ingredient: 'metformin' });
  });
  it('no duplicate for different medicines', () => {
    expect(findDuplicateIngredients([NAPA, COMET, SECLO])).toEqual([]);
  });
});

describe('harmful combinations (config/interactions.ts)', () => {
  it('clopidogrel + omeprazole (Clopid + Seclo)', () => {
    expect(findInteractions([CLOPID, SECLO, NAPA])).toEqual([{ code: 'interaction', id: 'clopidogrelPpi', severity: 'caution', brands: ['Clopid', 'Seclo'] }]);
  });
  it('warfarin + an NSAID is "avoid", in either order', () => {
    expect(findInteractions([CLOFENAC, WARIN])[0]).toMatchObject({ id: 'anticoagulantNsaid', severity: 'avoid' });
  });
  it('two different NSAIDs', () => {
    expect(findInteractions([CLOFENAC, NAPROSYN]).map((f) => (f.code === 'interaction' ? f.id : ''))).toEqual(['twoNsaids']);
  });
  it('sildenafil + a nitrate', () => {
    expect(findInteractions([SILDENA, NIDOCARD])[0]).toMatchObject({ id: 'pde5Nitrate', severity: 'avoid' });
  });
  it('nothing for an ordinary diabetes prescription', () => {
    expect(findInteractions([COMET, ROSUVA, NAPA, SECLO])).toEqual([]);
  });
});

describe('allergy and pregnancy flags from the profile', () => {
  it('allergy by group (penicillin → amoxicillin)', () => {
    expect(findAllergies([MOXACIL, NAPA], ['Penicillin'])).toEqual([{ code: 'allergy', allergy: 'Penicillin', brand: 'Moxacil' }]);
  });
  it('allergy by ingredient or brand name', () => {
    expect(findAllergies([NAPA, COMET], ['paracetamol']).map((f) => (f.code === 'allergy' ? f.brand : ''))).toEqual(['Napa']);
    expect(findAllergies([NAPA, COMET], ['Comet'])).toHaveLength(1);
    expect(findAllergies([NAPA], ['ab'])).toEqual([]); // too short to match safely
  });
  it('NSAID allergy covers diclofenac', () => {
    expect(findAllergies([CLOFENAC], ['NSAID'])).toHaveLength(1);
  });
  it('pregnancy: flags category D/X only, and only when pregnant', () => {
    expect(findPregnancyFlags([ROSUVA, NAPA, COMET], true)).toEqual([{ code: 'pregnancy', brand: 'Rosuva', category: 'X' }]);
    expect(findPregnancyFlags([ROSUVA], false)).toEqual([]);
    expect(findPregnancyFlags([med('Y', 'Y', 'C+D')], true)).toHaveLength(1);
  });
});

describe('checkPrescription', () => {
  it('collects every finding, plus lines not matched to the database', () => {
    const codes = checkPrescription([COMET, ROSUVA, NAPA, ACE, CLOPID, SECLO, med('Xyz syrup', null)], { allergies: [], pregnant: true }).map(
      (f) => f.code,
    );
    expect(codes).toEqual(['pregnancy', 'interaction', 'duplicateIngredient', 'notInDatabase']);
  });
  it('findings never advise stopping or changing a medicine', () => {
    const all = JSON.stringify(checkPrescription([CLOFENAC, WARIN, NAPA, ACE], { allergies: ['nsaid'], pregnant: true }));
    expect(all).not.toMatch(/stop|increase|reduce|dose/i);
  });
});

describe('report ↔ prescription', () => {
  const values = checkReport(
    parseReport('FBS 7.8 mmol/L 3.9 - 5.6\nHbA1c 8.1 % 4.0 - 5.6\nHaemoglobin 10.2 g/dL 12.0 - 15.5\nTotal Cholesterol 248 mg/dL < 200\nCreatinine 0.9 mg/dL 0.6 - 1.1'),
  );

  it('links medicines to the abnormal values they are commonly used for', () => {
    const rel = relateReportToPrescription(values, [COMET, ROSUVA, NAPA]);
    expect(rel).toEqual([
      { kind: 'related', test: 'FBS', status: 'high', brands: ['Comet'], linkId: 'bloodSugar', effect: 'lowers' },
      { kind: 'related', test: 'HbA1c', status: 'high', brands: ['Comet'], linkId: 'bloodSugar', effect: 'lowers' },
      { kind: 'noLinkedMedicine', test: 'Haemoglobin', status: 'low' },
      { kind: 'related', test: 'Total Cholesterol', status: 'high', brands: ['Rosuva'], linkId: 'cholesterol', effect: 'lowers' },
    ]);
  });

  it('a sugar-lowering medicine with LOW sugar "does not fit"', () => {
    const low = checkReport(parseReport('RBS 3.1 mmol/L 3.9 - 7.8'));
    expect(relateReportToPrescription(low, [COMET])).toEqual([
      { kind: 'doesNotFit', test: 'RBS', status: 'low', brands: ['Comet'], linkId: 'bloodSugar', effect: 'lowers' },
    ]);
  });

  it('normal values produce nothing', () => {
    expect(relateReportToPrescription(checkReport(parseReport('Creatinine 0.9 mg/dL 0.6 - 1.1')), [COMET])).toEqual([]);
  });
});
