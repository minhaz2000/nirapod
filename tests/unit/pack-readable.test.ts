import { describe, expect, it } from 'vitest';
import { isUsefulPackText } from '@/lib/ocr/pack';

describe('did on-phone OCR read anything useful?', () => {
  it.each([
    ['No Pain\nDiclofenac Potassium BP 50 mg\nTablet\nDrug International Ltd.', true],
    ['Napa 500 mg Tablet', true],
    ['Seclo Omeprazole capsule', true],
    ['Batch NP2503 Mfg 03/2025 Exp 02/2027', true],
    ['', false],
    ['~ ,. ||| 1l1 /// ==', false],
    ['ii ee rrr', false],
    ['Nm Pn', false],
    ['xxq zzt rrk', false],
  ])('%j → %s', (text, useful) => {
    expect(isUsefulPackText(text)).toBe(useful);
  });
});
