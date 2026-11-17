import { describe, expect, it } from 'vitest';
import { DANGER_SIGN_GROUPS, DANGER_SIGN_IDS, LOW_GLUCOSE_DANGER_BELOW_MMOL } from '@/config/danger-signs';
import {
  assessDangerSigns,
  hasChestPain,
  hasHeavyBleeding,
  hasLowGlucose,
  hasSevereBreathingDifficulty,
  hasStrokeSigns,
  isDangerSignId,
  isGlucoseDanger,
  isUnconscious,
  normaliseSelection,
} from '@/lib/rules/danger-signs';
import { toMmol } from '@/lib/rules/glucose';

describe('config/danger-signs', () => {
  it('every sign appears in exactly one UI group', () => {
    const grouped = DANGER_SIGN_GROUPS.flatMap((g) => g.signs);
    expect([...grouped].sort()).toEqual([...DANGER_SIGN_IDS].sort());
  });
  it('low-glucose threshold is 3.9 mmol/L (70 mg/dL)', () => {
    expect(LOW_GLUCOSE_DANGER_BELOW_MMOL).toBe(3.9);
  });
});

describe('individual danger-sign rules', () => {
  it('chest pain', () => {
    expect(hasChestPain(['chestPain'])).toBe(true);
    expect(hasChestPain(['bleeding'])).toBe(false);
  });

  it('stroke (FAST): any one of face, arm, speech', () => {
    expect(hasStrokeSigns(['strokeFace'])).toBe(true);
    expect(hasStrokeSigns(['strokeArm'])).toBe(true);
    expect(hasStrokeSigns(['strokeSpeech'])).toBe(true);
    expect(hasStrokeSigns(['strokeFace', 'strokeArm', 'strokeSpeech'])).toBe(true);
    expect(hasStrokeSigns(['chestPain', 'breathing'])).toBe(false);
  });

  it('severe breathing difficulty', () => {
    expect(hasSevereBreathingDifficulty(['breathing'])).toBe(true);
    expect(hasSevereBreathingDifficulty([])).toBe(false);
  });

  it('unconsciousness', () => {
    expect(isUnconscious(['unconscious'])).toBe(true);
    expect(isUnconscious(['strokeSpeech'])).toBe(false);
  });

  it('heavy bleeding', () => {
    expect(hasHeavyBleeding(['bleeding'])).toBe(true);
    expect(hasHeavyBleeding(['chestPain'])).toBe(false);
  });

  it('glucose strictly below 3.9 mmol/L (70 mg/dL)', () => {
    expect(isGlucoseDanger(3.8)).toBe(true);
    expect(isGlucoseDanger(2.2)).toBe(true);
    expect(isGlucoseDanger(toMmol(65, 'mgdl'))).toBe(true);
    expect(isGlucoseDanger(3.9)).toBe(false);
    expect(isGlucoseDanger(toMmol(72, 'mgdl'))).toBe(false);
    expect(isGlucoseDanger(7.8)).toBe(false);
  });

  it('missing or invalid glucose is not a danger sign by itself', () => {
    expect(isGlucoseDanger(undefined)).toBe(false);
    expect(isGlucoseDanger(Number.NaN)).toBe(false);
    expect(isGlucoseDanger(-1)).toBe(false);
  });

  it('low glucose from either the checklist or a reading', () => {
    expect(hasLowGlucose(['lowGlucose'])).toBe(true);
    expect(hasLowGlucose([], 3.1)).toBe(true);
    expect(hasLowGlucose([], 5.6)).toBe(false);
  });
});

describe('selection handling', () => {
  it('drops unknown ids, de-duplicates, keeps checklist order', () => {
    expect(normaliseSelection(['bleeding', 'nope', 'chestPain', 'bleeding'])).toEqual(['chestPain', 'bleeding']);
    expect(isDangerSignId('strokeFace')).toBe(true);
    expect(isDangerSignId('headache')).toBe(false);
  });
});

describe('assessDangerSigns', () => {
  it('nothing selected → no emergency', () => {
    expect(assessDangerSigns()).toEqual({ emergency: false, triggered: [], advice: [] });
    expect(assessDangerSigns({ selected: [], glucoseMmol: 6.5 }).emergency).toBe(false);
  });

  it('every single sign alone is an emergency', () => {
    for (const id of DANGER_SIGN_IDS) {
      const a = assessDangerSigns({ selected: [id] });
      expect(a.emergency, id).toBe(true);
      expect(a.triggered, id).toEqual([id]);
    }
  });

  it('stroke signs add "note the time" advice', () => {
    expect(assessDangerSigns({ selected: ['strokeArm'] }).advice).toEqual(['noteTime']);
  });

  it('safety rule 6: low glucose reading (e.g. Metformin + insulin user at 3.2) → emergency + take something sweet', () => {
    const a = assessDangerSigns({ glucoseMmol: 3.2 });
    expect(a).toEqual({ emergency: true, triggered: ['lowGlucose'], advice: ['sweetIfAwake'] });
  });

  it('low glucose + unconscious → nothing by mouth, never "sweet"', () => {
    const a = assessDangerSigns({ selected: ['unconscious'], glucoseMmol: 2.8 });
    expect(a.triggered).toEqual(['unconscious', 'lowGlucose']);
    expect(a.advice).toEqual(['nothingByMouth']);
  });

  it('does not duplicate lowGlucose when both tapped and measured', () => {
    expect(assessDangerSigns({ selected: ['lowGlucose'], glucoseMmol: 3 }).triggered).toEqual(['lowGlucose']);
  });
});
