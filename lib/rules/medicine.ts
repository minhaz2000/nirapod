/**
 * Deterministic medicine rules (placeholder).
 * TODO: expiry check, duplicate-generic detection (e.g. Napa + Ace are both paracetamol),
 * interaction warnings, cheaper same-generic alternatives (exact generic + strength + dosage form match),
 * and "suspicious packaging" signs. Never label a medicine fake or genuine (safety rule 2).
 */
export interface MedicineItem {
  brand: string;
  generic: string;
  strength: string;
  dosageForm: string;
}

/** Returns generic names that appear more than once in the list (case-insensitive). */
export function findDuplicateGenerics(items: MedicineItem[]): string[] {
  const seen = new Map<string, number>();
  for (const item of items) {
    const key = item.generic.trim().toLowerCase();
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return [...seen.entries()].filter(([, n]) => n > 1).map(([g]) => g);
}
