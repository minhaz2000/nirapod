import { describe, expect, it } from 'vitest';
import { decideLabel } from '@/lib/ai/confidence';

describe('safety rule 5: uncertainty is shown', () => {
  it('shows a label at or above min_confidence', () => {
    expect(decideLabel('scabies', 0.82, 0.7)).toEqual({ kind: 'label', label: 'scabies', confidence: 0.82 });
  });
  it('shows "not sure" below min_confidence, still carrying the confidence', () => {
    expect(decideLabel('scabies', 0.55, 0.7)).toEqual({ kind: 'not-sure', confidence: 0.55 });
  });
});
