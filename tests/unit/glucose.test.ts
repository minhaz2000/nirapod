import { describe, expect, it } from 'vitest';
import { formatGlucose, fromMmol, isLowGlucose, toMmol } from '@/lib/rules/glucose';

describe('glucose rules', () => {
  it('converts mg/dL ⇄ mmol/L', () => {
    expect(toMmol(180, 'mgdl')).toBeCloseTo(9.99, 1);
    expect(fromMmol(7, 'mgdl')).toBeCloseTo(126, 0);
    expect(toMmol(5.5, 'mmol')).toBe(5.5);
  });

  it('formats in the display unit', () => {
    expect(formatGlucose(5.55, 'mmol')).toBe('5.5');
    expect(formatGlucose(5.55, 'mgdl')).toBe('100');
  });

  it('safety rule 6: below 3.9 mmol/L (70 mg/dL) is low', () => {
    expect(isLowGlucose(3.8)).toBe(true);
    expect(isLowGlucose(toMmol(65, 'mgdl'))).toBe(true);
    expect(isLowGlucose(3.9)).toBe(false);
    expect(isLowGlucose(6.2)).toBe(false);
  });
});
