/**
 * The assistant's tools: our existing, tested code — never the model's memory.
 * search_medicine (fuzzy brand + generic, Bangla-friendly), alternatives (exact generic + strength + form, rule 10),
 * duplicate generics (prescription rules), expiry check (labelled dates only), report explanation (lib/explain).
 */
import 'server-only';
import { getMedicineDb } from '@/lib/medicine/db';
import { findAlternatives, nameIndex, searchBrandsAndGenerics, type Product } from '@/lib/medicine/repo';
import { closestName } from '@/lib/medicine/suggest';
import { parseDateValue, formatPackDate } from '@/lib/ocr/expiry';
import { expiryStatus } from '@/lib/rules/medicine';
import { findDuplicateIngredients, type ConfirmedMedicine } from '@/lib/rules/prescription';
import type { AssistantCard, MedicineSummary } from './types';

export const summary = (p: Product): MedicineSummary => ({
  id: p.id,
  brand: p.brand,
  generic: p.generic,
  strength: p.strength,
  form: p.form,
  manufacturer: p.manufacturer,
  indication: p.indication ? (p.indication.length > 300 ? `${p.indication.slice(0, 300)}…` : p.indication) : null,
  ...(p.genericOnly ? { genericOnly: true } : {}),
});

/** Finds a medicine by name (brand or generic; typos and Bangla script tolerated). Best match only. */
export function searchMedicine(query: string): { medicine: MedicineSummary; all: MedicineSummary[] } | null {
  const db = getMedicineDb();
  if (!db) return null;
  const q = query.trim().slice(0, 60);
  if (q.length < 2) return null;
  const results = searchBrandsAndGenerics(db, q).filter((r) => r.score <= 3);
  const first = results[0]?.products ?? [];
  if (!first.length) return null;
  // Prefer the tablet / capsule form most people mean, then the first strength.
  const pick = first.find((p) => /tablet|capsule/i.test(p.form)) ?? first[0]!;
  return { medicine: summary(pick), all: first.slice(0, 6).map(summary) };
}

/** Words in a free-text message that are medicine names in our database (exact or one OCR / typing slip). */
export function medicineNamesIn(text: string, max = 3): string[] {
  const db = getMedicineDb();
  if (!db) return [];
  const index = nameIndex(db);
  const out: string[] = [];
  const words = text.replace(/[^\p{L}\p{N}\s-]/gu, ' ').split(/\s+/).filter((w) => w.length >= 3);
  const STOP = /^(?:what|when|which|where|does|this|that|with|from|have|cheaper|cheap|alternative|alternatives|medicine|tablet|capsule|expire|expiry|used|for|the|and|is|are|can|price|same|generic|brand|about|tell|explain|report|my)$/i;
  for (let i = 0; i < words.length && out.length < max; i++) {
    for (const span of [2, 1]) {
      const phrase = words.slice(i, i + span).join(' ');
      if (span === 1 && STOP.test(phrase)) continue;
      const m = closestName(phrase, index);
      if (m && m.score <= 2 && !out.includes(m.name)) {
        out.push(m.name);
        i += span - 1;
        break;
      }
    }
  }
  return out;
}

export function alternativesCard(medicine: MedicineSummary): AssistantCard | null {
  const db = getMedicineDb();
  if (!db || medicine.genericOnly || medicine.id <= 0) return null;
  const r = findAlternatives(db, medicine.id, 8);
  if (r.status === 'not_found') return null;
  if (r.status !== 'ok') return { type: 'alternatives', medicine, alternatives: [], status: 'not_comparable' };
  return {
    type: 'alternatives',
    medicine: summary(r.product),
    status: 'ok',
    alternatives: r.alternatives.slice(0, 5).map((a) => ({ ...summary(a), unitPrice: a.unitPrice, cheaper: a.cheaper })),
  };
}

/** Same generic twice (e.g. Napa + Ace = paracetamol twice) among confirmed medicines. */
export function duplicatesCard(names: readonly string[]): AssistantCard | null {
  const found = names.map((n) => ({ name: n, hit: searchMedicine(n) })).filter((x) => x.hit);
  if (found.length < 2) return null;
  const meds: ConfirmedMedicine[] = found.map((f, i) => ({
    lineId: String(i),
    brand: f.hit!.medicine.brand,
    generic: f.hit!.medicine.generic,
    strength: f.hit!.medicine.strength,
    form: f.hit!.medicine.form,
    frequency: '',
    duration: '',
    pregnancyCategory: null,
  }));
  const groups = findDuplicateIngredients(meds).flatMap((f) => (f.code === 'duplicateIngredient' ? [{ ingredient: f.ingredient, brands: f.brands }] : []));
  return { type: 'duplicates', groups, checked: meds.map((m) => m.brand) };
}

/** Expiry from a date the user typed ("EXP 08/2027", "AUG 27"); unreadable → unknown, never a guess. */
export function expiryCard(dateText: string, today = new Date()): AssistantCard {
  const exp = parseDateValue(dateText, 'exp');
  if (!exp) return { type: 'expiry', status: 'unknown', exp: null };
  const s = expiryStatus({ exp }, today);
  return { type: 'expiry', status: s.status, exp: formatPackDate(exp) };
}
