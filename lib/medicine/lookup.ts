/**
 * Best database match for a medicine name (brand or generic, typos and Bangla script tolerated), and duplicate
 * generics among several names. Shared by the Nirapod Assistant and the Nirapod MCP server (one implementation).
 * Pure over a read-only better-sqlite3 Database; no user data.
 */
import type Database from 'better-sqlite3';
import { findDuplicateIngredients, type ConfirmedMedicine } from '@/lib/rules/prescription';
import { searchBrandsAndGenerics, type BrandMatch, type Product } from './repo';

/** Matches weaker than this are not treated as the medicine the user meant. */
export const LOOKUP_MAX_SCORE = 3;

export interface Lookup {
  /** The product most people mean (tablet / capsule first), from the best brand or generic match. */
  product: Product;
  /** Other strengths / forms of the same best match. */
  all: Product[];
  match: BrandMatch;
}

export function bestMatch(db: Database.Database, query: string): Lookup | null {
  const q = query.trim().slice(0, 60);
  if (q.length < 2) return null;
  const match = searchBrandsAndGenerics(db, q).find((r) => r.score <= LOOKUP_MAX_SCORE && r.products.length);
  if (!match) return null;
  const product = match.products.find((p) => /tablet|capsule/i.test(p.form)) ?? match.products[0]!;
  return { product, all: match.products, match };
}

export interface DuplicateResult {
  /** Each name and what it was matched to (null when not in the database: it cannot be checked). */
  resolved: Array<{ name: string; brand: string | null; generic: string | null }>;
  /** Ingredients that appear in more than one of the medicines. */
  groups: Array<{ ingredient: string; brands: string[] }>;
}

/** Same generic in two or more medicines (e.g. two metformin brands): the app's prescription rule. */
export function duplicateGenerics(db: Database.Database, names: readonly string[]): DuplicateResult {
  const resolved = names.map((name) => {
    const hit = bestMatch(db, name);
    return { name, brand: hit?.product.brand ?? null, generic: hit?.product.generic ?? null, product: hit?.product ?? null };
  });
  const meds: ConfirmedMedicine[] = resolved.flatMap((r, i) =>
    r.product
      ? [{ lineId: String(i), brand: r.product.brand, generic: r.product.generic, strength: r.product.strength, form: r.product.form, frequency: '', duration: '', pregnancyCategory: null }]
      : [],
  );
  const groups = findDuplicateIngredients(meds).flatMap((f) => (f.code === 'duplicateIngredient' ? [{ ingredient: f.ingredient, brands: f.brands }] : []));
  return { resolved: resolved.map(({ name, brand, generic }) => ({ name, brand, generic })), groups };
}
