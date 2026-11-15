import { describe, expect, it } from 'vitest';
import { findDuplicateGenerics } from '@/lib/rules/medicine';

describe('medicine rules', () => {
  it('flags duplicate generics (Napa + Ace are both paracetamol)', () => {
    const dupes = findDuplicateGenerics([
      { brand: 'Napa', generic: 'Paracetamol', strength: '500 mg', dosageForm: 'Tablet' },
      { brand: 'Ace', generic: 'paracetamol', strength: '500 mg', dosageForm: 'Tablet' },
      { brand: 'Seclo', generic: 'Omeprazole', strength: '20 mg', dosageForm: 'Capsule' },
    ]);
    expect(dupes).toEqual(['paracetamol']);
  });

  it('no duplicates for Metformin + Omeprazole', () => {
    expect(
      findDuplicateGenerics([
        { brand: 'Comet', generic: 'Metformin Hydrochloride', strength: '500 mg', dosageForm: 'Tablet' },
        { brand: 'Seclo', generic: 'Omeprazole', strength: '20 mg', dosageForm: 'Capsule' },
      ]),
    ).toEqual([]);
  });
});
