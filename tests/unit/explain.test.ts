import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';
import bn from '@/messages/bn.json';
import en from '@/messages/en.json';
import { parseExplainInput, type ExplainInput } from '@/lib/explain/input';
import { buildTemplate, type ExplainT } from '@/lib/explain/template';
import { numbersIn, validateExplanation } from '@/lib/explain/validate';

const t = (locale: 'bn' | 'en') =>
  createTranslator({ locale, messages: locale === 'bn' ? bn : en, namespace: 'medicine.explain' }) as unknown as ExplainT;

const INPUT: ExplainInput = {
  locale: 'en',
  doctorDiagnosis: 'Type 2 DM, Dyslipidaemia',
  lowGlucoseEmergency: false,
  values: [
    { test: 'Fasting Blood Sugar', value: 7.8, unit: 'mmol/L', status: 'high', range: '3.9 - 5.6', rangeSource: 'printed' },
    { test: 'Haemoglobin', value: 10.2, unit: 'g/dL', status: 'low', range: '12.0 - 15.5', rangeSource: 'printed' },
    { test: 'Serum Creatinine', value: 0.9, unit: 'mg/dL', status: 'normal', range: '0.6 - 1.1', rangeSource: 'printed' },
  ],
  medicines: [
    { brand: 'Comet', generic: 'Metformin Hydrochloride', strength: '500mg', form: 'Tablet', frequency: '1+0+1', duration: '30 days' },
    { brand: 'Napa', generic: 'Paracetamol', strength: '500mg', form: 'Tablet', frequency: 'SOS', duration: '' },
    { brand: 'Ace', generic: 'Paracetamol', strength: '500mg', form: 'Tablet', frequency: '1+1+1', duration: '5 days' },
  ],
  findings: [{ code: 'duplicateIngredient', ingredient: 'paracetamol', brands: ['Napa', 'Ace'] }],
  relations: [
    { kind: 'related', test: 'Fasting Blood Sugar', status: 'high', brands: ['Comet'], linkId: 'bloodSugar', effect: 'lowers' },
    { kind: 'noLinkedMedicine', test: 'Haemoglobin', status: 'low' },
  ],
};

const DICT = new Set(['comet', 'napa', 'ace', 'paracetamol', 'metformin hydrochloride', 'metformin', 'seclo', 'omeprazole', 'insulin', 'ferrous fumarate', 'rosuva']);
const validate = (text: string, input: ExplainInput = INPUT) =>
  validateExplanation(text, input, { dictionary: DICT, allowedText: buildTemplate(input, t(input.locale)).join('\n') });

describe('template explanation', () => {
  it('English: diagnosis first, values, medicines, relations, findings, closing', () => {
    const lines = buildTemplate(INPUT, t('en'));
    expect(lines[0]).toBe('Your doctor wrote this diagnosis: Type 2 DM, Dyslipidaemia. It comes before the general information below.');
    expect(lines).toContain('Fasting Blood Sugar is 7.8 mmol/L, which is above the printed range (3.9 - 5.6).');
    expect(lines).toContain('Haemoglobin is 10.2 g/dL, which is below the printed range (12.0 - 15.5).');
    expect(lines).toContain('Comet contains Metformin Hydrochloride.');
    expect(lines).toContain('Comet is commonly used when Fasting Blood Sugar is high.');
    expect(lines.join(' ')).toContain('no medicine on this prescription is commonly linked to it. Ask your doctor; do not stop on your own.');
    expect(lines.join(' ')).toContain('Napa, Ace all contain paracetamol');
    expect(lines.at(-1)).toMatch(/not a diagnosis/);
  });

  it('Bangla template uses Bangla wording', () => {
    const lines = buildTemplate({ ...INPUT, locale: 'bn' }, t('bn'));
    expect(lines[0]).toContain('আপনার ডাক্তার এই রোগ নির্ণয় লিখেছেন');
    expect(lines.join(' ')).toContain('নিজে থেকে বন্ধ করবেন না');
  });

  it('low sugar emergency comes before anything else after the diagnosis (rule 6)', () => {
    const lines = buildTemplate({ ...INPUT, doctorDiagnosis: null, lowGlucoseEmergency: true }, t('en'));
    expect(lines[0]).toMatch(/give something sweet now and call 999/);
  });

  it('the template itself always passes the validator', () => {
    for (const locale of ['en', 'bn'] as const) {
      const input = { ...INPUT, locale };
      expect(validate(buildTemplate(input, t(locale)).join('\n'), input)).toEqual({ ok: true });
    }
  });
});

describe('validateExplanation (rule 8)', () => {
  const good = `- Your doctor wrote: Type 2 DM, Dyslipidaemia.
- Your fasting blood sugar is 7.8 mmol/L, above the printed range of 3.9 - 5.6.
- Comet (metformin hydrochloride) is commonly used when blood sugar is high.
- Napa and Ace both contain paracetamol, so taking them together may mean a double dose.
- Haemoglobin is 10.2, below its range. Ask your doctor or pharmacist; do not stop on your own.`;

  it('accepts a faithful rephrasing', () => {
    expect(validate(good)).toEqual({ ok: true });
  });

  it('rejects a medicine name that is not in the input', () => {
    expect(validate(`${good}\n- Omeprazole can help your stomach.`)).toMatchObject({ ok: false, reason: 'unknownMedicine', detail: 'omeprazole' });
    expect(validate(`${good}\n- Ferrous fumarate may help.`)).toMatchObject({ ok: false, reason: 'unknownMedicine' });
  });

  it('rejects a number that is not in the input (Bangla digits too)', () => {
    expect(validate(`${good}\n- A normal HbA1c is below 6.5%.`)).toMatchObject({ ok: false, reason: 'unknownNumber', detail: '6.5' });
    expect(validate('- রক্তে চিনি ৯.১ mmol/L।', { ...INPUT, locale: 'bn' })).toMatchObject({ ok: false, reason: 'unknownNumber' });
    expect(validate('- Call 999 now.')).toMatchObject({ ok: false, reason: 'unknownNumber', detail: '999' }); // only with an emergency
    expect(validate('- Call 999 now.', { ...INPUT, lowGlucoseEmergency: true })).toEqual({ ok: true });
  });

  it('ignores list markers but not other numbers', () => {
    expect(numbersIn('1. First\n2. Second 7.8')).toEqual([7.8]);
    expect(numbersIn('1,50,000 /cumm and ৩.৯')).toEqual([150000, 3.9]);
  });

  it('rejects dose advice and stop/start instructions (rule 3)', () => {
    expect(validate('- You should stop taking Ace.')).toMatchObject({ ok: false, reason: 'doseAdvice' });
    expect(validate('- Reduce the dose of Comet.')).toMatchObject({ ok: false, reason: 'doseAdvice' });
    expect(validate('- Double the dose of Comet.')).toMatchObject({ ok: false, reason: 'doseAdvice' });
    expect(validate('- Take 1 tablet of Napa.')).toMatchObject({ ok: false, reason: 'doseAdvice' });
    expect(validate('- Increase your insulin.', { ...INPUT, medicines: [...INPUT.medicines] })).toMatchObject({ ok: false });
    expect(validate('- Ace খাওয়া বন্ধ করুন।', { ...INPUT, locale: 'bn' })).toMatchObject({ ok: false, reason: 'doseAdvice' });
    expect(validate('- Comet-এর ডোজ কমান।', { ...INPUT, locale: 'bn' })).toMatchObject({ ok: false, reason: 'doseAdvice' });
  });

  it('allows the required "do not stop on your own" wording', () => {
    expect(validate('- Ask your doctor; do not stop on your own.')).toEqual({ ok: true });
    expect(validate("- Don't stop or change any medicine yourself.")).toEqual({ ok: true });
    expect(validate('- ডাক্তারকে জিজ্ঞেস করুন; নিজে থেকে বন্ধ করবেন না।', { ...INPUT, locale: 'bn' })).toEqual({ ok: true });
  });

  it('rejects diagnosis statements (rule 1)', () => {
    expect(validate('- You have diabetes.')).toMatchObject({ ok: false, reason: 'diagnosis' });
    expect(validate('- আপনার ডায়াবেটিস আছে।', { ...INPUT, locale: 'bn' })).toMatchObject({ ok: false, reason: 'diagnosis' });
  });

  it('rejects empty and overly long text', () => {
    expect(validate('  ')).toMatchObject({ ok: false, reason: 'empty' });
    expect(validate('a '.repeat(2000))).toMatchObject({ ok: false, reason: 'tooLong' });
  });
});

describe('parseExplainInput', () => {
  it('accepts the structured input and redacts strings (rule 9)', () => {
    const parsed = parseExplainInput({ ...INPUT, doctorDiagnosis: 'Type 2 DM. Mobile: 01712345678' });
    expect(parsed?.doctorDiagnosis).toBe('Type 2 DM. Mobile: [REDACTED]');
    expect(parsed?.findings).toHaveLength(1);
  });

  it('drops findings or relations that refer to medicines or tests not in the input', () => {
    const parsed = parseExplainInput({
      ...INPUT,
      findings: [{ code: 'duplicateIngredient', ingredient: 'x', brands: ['Napa', 'Seclo'] }],
      relations: [{ kind: 'noLinkedMedicine', test: 'TSH', status: 'high' }],
    });
    expect(parsed?.findings).toEqual([]);
    expect(parsed?.relations).toEqual([]);
  });

  it('rejects malformed input', () => {
    expect(parseExplainInput(null)).toBeNull();
    expect(parseExplainInput({ ...INPUT, locale: 'fr' })).toBeNull();
    expect(parseExplainInput({ ...INPUT, values: [{ test: 'x', value: 'high' }] })).toBeNull();
    expect(parseExplainInput({ ...INPUT, findings: [{ code: 'freeText', text: 'anything' }] })).toBeNull();
    expect(parseExplainInput({ ...INPUT, medicines: new Array(31).fill(INPUT.medicines[0]) })).toBeNull();
  });
});
