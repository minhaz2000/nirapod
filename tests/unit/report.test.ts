import { describe, expect, it } from 'vitest';
import { canonicalTestKey, parseReport, unitKey } from '@/lib/ocr/report';
import { checkReport, checkValue, fallbackRange } from '@/lib/rules/report-ranges';

const REPORT = `
Popular Diagnostic Centre Ltd.            Patient: Rahima Begum   Age: 52 Years   Sex: F
Date: 12/11/2026     Ref. by: Dr. A. Karim
Test                         Result     Unit       Reference Value
Fasting Blood Sugar (FBS)    7.8        mmol/L     3.9 - 5.6
HbA1c                        8.1        %          4.0 - 5.6
Haemoglobin                  10.2   L   g/dL       12.0 - 15.5
Total Cholesterol            248        mg/dL      < 200
Serum Creatinine             0.9        mg/dL      0.6 - 1.1
SGPT (ALT)                   32         U/L        Up to 40
Platelet Count               1,50,000   /cumm      1,50,000 - 4,00,000
TSH                          2.10       µIU/mL
Potassium                    5.9 H      mmol/L
`;

describe('parseReport', () => {
  const rows = parseReport(REPORT);
  const by = (k: string) => rows.find((r) => r.key === k);

  it('finds the test rows and skips the header lines (patient, age, date)', () => {
    expect(rows.map((r) => r.key)).toEqual([
      'fasting_glucose',
      'hba1c',
      'hemoglobin',
      'total_cholesterol',
      'creatinine',
      'alt',
      'platelets',
      'tsh',
      'potassium',
    ]);
  });

  it('reads value, unit and printed range', () => {
    expect(by('fasting_glucose')).toMatchObject({ name: 'Fasting Blood Sugar (FBS)', value: 7.8, unit: 'mmol/L', range: { low: 3.9, high: 5.6 } });
    expect(by('hba1c')).toMatchObject({ value: 8.1, unit: '%', range: { low: 4, high: 5.6 } });
    expect(by('total_cholesterol')).toMatchObject({ value: 248, unit: 'mg/dL', range: { high: 200 } });
    expect(by('alt')).toMatchObject({ value: 32, unit: 'U/L', range: { high: 40, text: 'Up to 40' } });
    expect(by('platelets')).toMatchObject({ value: 150000, unit: '/cumm', range: { low: 150000, high: 400000 } });
  });

  it('reads H / L flags printed next to the value', () => {
    expect(by('hemoglobin')).toMatchObject({ value: 10.2, printedFlag: 'low', unit: 'g/dL' });
    expect(by('potassium')).toMatchObject({ value: 5.9, printedFlag: 'high', range: null });
  });

  it('keeps an unknown test only when a range is printed', () => {
    expect(parseReport('Serum Ferritin 8 ng/mL 15 - 150')).toMatchObject([{ key: null, value: 8, range: { low: 15, high: 150 } }]);
    expect(parseReport('Serum Ferritin 8 ng/mL')).toEqual([]);
  });

  it('Bangla digits from OCR', () => {
    expect(parseReport('FBS ৬.২ mmol/L ৩.৯ - ৫.৬')[0]).toMatchObject({ value: 6.2, range: { low: 3.9, high: 5.6 } });
  });
});

describe('names and units', () => {
  it('canonical keys from many spellings', () => {
    expect(canonicalTestKey('RBS')).toBe('random_glucose');
    expect(canonicalTestKey('S. Creatinine')).toBe('creatinine');
    expect(canonicalTestKey('Glycated Haemoglobin (HbA1c)')).toBe('hba1c');
    expect(canonicalTestKey('Blood Sugar 2 hours after breakfast')).toBe('after_meal_glucose');
    expect(canonicalTestKey('Widal test')).toBeNull();
  });
  it('unit keys', () => {
    expect(unitKey('mmol/L')).toBe('mmol/l');
    expect(unitKey('µmol/L')).toBe('umol/l');
    expect(unitKey('IU/L')).toBe('u/l');
    expect(unitKey('µIU/mL')).toBe('miu/l');
    expect(unitKey('x10^9/L')).toBe('10^9/l');
    expect(unitKey('/cmm')).toBe('/cumm');
  });
});

describe('checkReport — flags values outside the range', () => {
  const checked = checkReport(parseReport(REPORT));
  const by = (k: string) => checked.find((c) => c.key === k)!;

  it('uses the printed range first', () => {
    expect(by('fasting_glucose')).toMatchObject({ status: 'high', rangeSource: 'printed' });
    expect(by('hba1c')).toMatchObject({ status: 'high', rangeSource: 'printed' });
    expect(by('hemoglobin')).toMatchObject({ status: 'low', rangeSource: 'printed' });
    expect(by('total_cholesterol')).toMatchObject({ status: 'high' });
    expect(by('creatinine')).toMatchObject({ status: 'normal' });
    expect(by('alt')).toMatchObject({ status: 'normal' });
    expect(by('platelets')).toMatchObject({ status: 'normal' }); // the boundary value counts as inside
  });

  it('falls back to config ranges only when the unit matches', () => {
    expect(by('tsh')).toMatchObject({ status: 'normal', rangeSource: 'fallback' });
    expect(fallbackRange('creatinine', 'umol/L')).toEqual({ low: 53, high: 115 });
    expect(fallbackRange('creatinine', 'mmol/L')).toBeNull(); // no silent unit conversion
  });

  it('uses the printed H / L flag when there is no range', () => {
    // potassium 5.9 has no printed range but a fallback exists for mmol/L → fallback wins over the flag
    expect(by('potassium')).toMatchObject({ status: 'high', rangeSource: 'fallback' });
    const flagged = checkValue({ name: 'Ferritin', key: null, value: 8, unit: 'ng/mL', range: null, rangeNote: null, printedFlag: 'low' });
    expect(flagged).toMatchObject({ status: 'low', rangeSource: 'printed-flag' });
  });

  it('unknown when there is no range at all', () => {
    expect(checkValue({ name: 'X', key: null, value: 1, unit: '', range: null, rangeNote: null, printedFlag: null }).status).toBe('unknown');
  });

  it('safety rule 6: glucose below 3.9 mmol/L or 70 mg/dL is an emergency', () => {
    expect(checkReport(parseReport('RBS 3.2 mmol/L 3.9 - 7.8'))[0]).toMatchObject({ status: 'low', lowGlucoseEmergency: true });
    expect(checkReport(parseReport('FBS 60 mg/dL 70 - 100'))[0]!.lowGlucoseEmergency).toBe(true);
    expect(checkReport(parseReport('FBS 4.2 mmol/L 3.9 - 5.6'))[0]!.lowGlucoseEmergency).toBe(false);
    expect(checkReport(parseReport('HbA1c 3.0 % 4.0 - 5.6'))[0]!.lowGlucoseEmergency).toBe(false); // not a glucose reading
  });
});

describe('OCR decimal-point misreads in ranges (real tesseract output on the sample report)', () => {
  // Exact lines tesseract produced; the printed ranges were 4.0 - 5.6, 12.0 - 15.5 and 0.6 - 1.1.
  const OCR = [
    'HbAlc                                      8.1        %           40-56',
    'Haemoglobin                                10.2       g/dL        12.0- 155',
    'Serum Creatinine                        0.9        mg/dL     06-11',
  ].join('\n');
  const rows = checkReport(parseReport(OCR));

  it('HbA1c "40-56" is repaired from the fallback range, so 8.1 is HIGH, not low', () => {
    expect(rows[0]).toMatchObject({ key: 'hba1c', range: { low: 4, high: 5.6, text: '4 - 5.6' }, rangeNote: 'repaired', status: 'high' });
  });
  it('"12.0- 155" → 12.0 - 15.5 (the other bound has a decimal)', () => {
    expect(rows[1]).toMatchObject({ range: { low: 12, high: 15.5 }, rangeNote: 'repaired', status: 'low' });
  });
  it('"06-11" → 0.6 - 1.1 (leading zero, then the other bound)', () => {
    expect(rows[2]).toMatchObject({ range: { low: 0.6, high: 1.1 }, rangeNote: 'repaired', status: 'normal' });
    expect(checkReport(parseReport('Serum Creatinine 1.6 mg/dL 06-11'))[0]!.status).toBe('high');
  });
  it('an implausible range on an unknown test is not trusted (no flag), and is marked suspect', () => {
    expect(checkReport(parseReport('Serum Ferritin 8.5 ng/mL 150-400'))[0]).toMatchObject({ range: null, rangeNote: 'suspect', rangeSuspect: true, status: 'unknown' });
  });
  it('correct ranges are left alone', () => {
    expect(parseReport('Platelet Count 150000 /cumm 150000 - 400000')[0]!.rangeNote).toBeNull();
    expect(parseReport('TSH 0.5 mIU/L 0.4 - 4')[0]).toMatchObject({ range: { low: 0.4, high: 4 }, rangeNote: null });
    expect(parseReport('Total Cholesterol 248 mg/dL < 200')[0]!.rangeNote).toBeNull();
  });
  it('parseRangeText for user edits', async () => {
    const { parseRangeText } = await import('@/lib/ocr/report');
    expect(parseRangeText('4.0 - 5.6')).toMatchObject({ low: 4, high: 5.6 });
    expect(parseRangeText('up to 40')).toMatchObject({ high: 40 });
    expect(parseRangeText('9 - 2')).toBeNull();
    expect(parseRangeText('normal')).toBeNull();
  });
});
