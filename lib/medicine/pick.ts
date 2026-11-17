/** Chooses which database product to pre-select from the pack text (the user still confirms it). */
import { formKey, strengthKey } from './normalise';
import type { BrandMatch, Product } from './repo';

export function preselectProduct(matches: readonly BrandMatch[], packText: string): Product | null {
  const text = packText.toLowerCase().replace(/\s+/g, '');
  let best: { product: Product; score: number } | null = null;
  matches.forEach((m, brandRank) => {
    for (const p of m.products) {
      const strength = strengthKey(p.strength);
      const form = formKey(p.form).replace(/\s+/g, '');
      const score =
        -brandRank * 10 - m.score * 10 + (strength && text.includes(strength) ? 5 : 0) + (form && text.includes(form) ? 2 : 0);
      if (!best || score > best.score) best = { product: p, score };
    }
  });
  return best ? (best as { product: Product }).product : null;
}
