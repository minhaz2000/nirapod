/**
 * The Nirapod MCP tools as plain functions over the read-only SQLite files (unit-tested without MCP).
 * Everything comes from the app's own code: the medicine matcher, exact-match alternatives (rule 10), the duplicate
 * generic rule, FoodNetBD lookups and the pack expiry parser. No user data is read or stored; nothing is logged.
 * Every response follows the safety rules: no fake / genuine verdict, no advice to change a medicine or dose, no
 * diagnosis.
 */
import type Database from 'better-sqlite3';
import { EXPIRY } from '@/config/expiry';
import { bestMatch, duplicateGenerics } from '@/lib/medicine/lookup';
import { findAlternatives, getDataInfo, getProduct as getProductById, searchBrandsAndGenerics, type Product } from '@/lib/medicine/repo';
import { nutritionSource, searchFoods } from '@/lib/nutrition/repo';
import { expiryFromText } from '@/lib/rules/medicine';

export const NOTES = {
  prices: 'Prices are from the dataset snapshot and may be out of date.',
  pharmacist: 'Confirm with your pharmacist before switching.',
  duplicates: 'Ask your doctor or pharmacist; do not stop on your own.',
  info: 'Information only, not medical advice. Nirapod does not judge whether a medicine pack is real and never advises starting, stopping or changing a medicine or dose.',
} as const;

export const LIMITS = { query: 60, results: 20, medicines: 20, dateText: 60 } as const;

const clip = (s: string, max: number) => s.trim().slice(0, max);

export interface MedicineResult {
  brand: string;
  generic: string | null;
  strength: string;
  dosage_form: string;
  manufacturer: string | null;
  price: { unit_price_bdt: number | null; unit: string | null; packs: Array<{ pack: string; price_bdt: number }> };
}

function medicine(p: Product): MedicineResult {
  return {
    brand: p.brand,
    generic: p.generic,
    strength: p.strength,
    dosage_form: p.form,
    manufacturer: p.manufacturer,
    price: { unit_price_bdt: p.unitPrice, unit: p.unit, packs: p.packs.map((k) => ({ pack: k.label, price_bdt: k.price })) },
  };
}

function dataset(db: Database.Database) {
  const info = getDataInfo(db);
  return { name: info.sourceName, url: info.sourceUrl, licence: info.licence, prices_as_of: info.lastUpdated };
}

/** search_medicine: brand or generic, English or Bangla script, typos tolerated. */
export function searchMedicine(db: Database.Database, query: string, limit = 5) {
  const q = clip(query, LIMITS.query);
  const n = Math.min(Math.max(1, Math.floor(limit) || 5), LIMITS.results);
  const results: MedicineResult[] = [];
  for (const m of searchBrandsAndGenerics(db, q)) {
    if (m.score > 3 || m.genericOnly) continue;
    // Tablets and capsules first: the form most people mean.
    const common = (p: Product) => (/tablet|capsule/i.test(p.form) ? 0 : 1);
    for (const p of [...m.products].sort((a, b) => common(a) - common(b))) {
      results.push(medicine(p));
      if (results.length >= n) break;
    }
    if (results.length >= n) break;
  }
  // A generic name with no brand match: list its brands.
  if (!results.length) {
    const g = searchBrandsAndGenerics(db, q).find((m) => m.genericOnly && m.score <= 3);
    if (g?.products[0]?.generic) {
      const generic = g.products[0].generic;
      const rows = db
        .prepare('SELECT p.id FROM products p JOIN generics gg ON gg.id = p.generic_id WHERE gg.name = ? ORDER BY p.unit_price IS NULL, p.unit_price LIMIT ?')
        .pluck()
        .all(generic, n) as number[];
      for (const id of rows) {
        const p = getProductById(db, id);
        if (p) results.push(medicine(p));
      }
    }
  }
  return {
    query: q,
    found: results.length > 0,
    results,
    ...(results.length ? {} : { message: `"${q}" was not found in the medicine dataset. Check the spelling, or ask a pharmacist.` }),
    note: NOTES.prices,
    disclaimer: NOTES.info,
    dataset: dataset(db),
  };
}

export interface AlternativesResult {
  brand: string;
  found: boolean;
  medicine?: MedicineResult;
  other_strengths_and_forms?: string[];
  match_rule?: string;
  alternatives?: Array<MedicineResult & { cheaper: boolean }>;
  message?: string;
  note: string;
  prices_note?: string;
  disclaimer: string;
  dataset?: ReturnType<typeof dataset>;
}

/** find_cheaper_alternatives: same generic, strength and dosage form only (rule 10), cheapest first. */
export function cheaperAlternatives(db: Database.Database, brand: string, strength?: string, dosageForm?: string): AlternativesResult {
  const q = clip(brand, LIMITS.query);
  const hit = bestMatch(db, q);
  if (!hit || hit.product.genericOnly) {
    return { brand: q, found: false, message: `"${q}" was not found as a brand in the medicine dataset.`, note: NOTES.pharmacist, disclaimer: NOTES.info };
  }
  const want = (s: string | undefined, v: string) => !s || v.toLowerCase().replace(/\s+/g, '').includes(s.toLowerCase().replace(/\s+/g, ''));
  const product = hit.all.find((p) => want(strength, p.strength) && want(dosageForm, p.form)) ?? hit.product;
  const r = findAlternatives(db, product.id, LIMITS.results);
  const base = { brand: q, found: true, medicine: medicine(product), other_strengths_and_forms: hit.all.filter((p) => p.id !== product.id).map((p) => `${p.strength || '?'} ${p.form}`) };
  if (r.status !== 'ok') {
    return { ...base, alternatives: [], message: r.status === 'not_comparable' ? `Prices cannot be compared (${r.reason.replace(/_/g, ' ')}).` : 'Not found.', note: NOTES.pharmacist, prices_note: NOTES.prices, disclaimer: NOTES.info };
  }
  return {
    ...base,
    match_rule: 'Same generic, same strength and same dosage form only.',
    alternatives: r.alternatives.map((a) => ({ ...medicine(a), cheaper: a.cheaper })),
    note: NOTES.pharmacist,
    prices_note: NOTES.prices,
    disclaimer: NOTES.info,
    dataset: dataset(db),
  };
}

/** check_duplicate_generics: brands that share a generic (the app's prescription rule). */
export function checkDuplicates(db: Database.Database, medicines: readonly string[]) {
  const names = medicines.slice(0, LIMITS.medicines).map((m) => clip(m, LIMITS.query)).filter(Boolean);
  const r = duplicateGenerics(db, names);
  return {
    checked: r.resolved.map((x) => ({ name: x.name, matched_brand: x.brand, generic: x.generic, in_dataset: x.brand !== null })),
    duplicates: r.groups.map((g) => ({ generic: g.ingredient, brands: g.brands })),
    summary: r.groups.length ? `${r.groups.length} generic(s) appear in more than one medicine.` : 'No generic appears in more than one of the medicines found in the dataset.',
    note: NOTES.duplicates,
    disclaimer: NOTES.info,
  };
}

/** get_food_carbs: carbohydrates per 100 g from FoodNetBD. */
export function foodCarbs(db: Database.Database, food: string, limit = 3) {
  const q = clip(food, LIMITS.query);
  const matches = searchFoods(db, q, Math.min(Math.max(1, limit), 10));
  return {
    food: q,
    found: matches.length > 0,
    results: matches.map((f) => ({
      name_en: f.nameEn,
      name_bn: f.nameBn,
      preparation: f.preparation,
      carbs_g_per_100g: f.carbsPer100g,
      sugars_g_per_100g: f.sugarsPer100g,
      fibre_g_per_100g: f.fibrePer100g,
      energy_kcal_per_100g: f.energyKcalPer100g,
      typical_serving_g: f.servingG,
    })),
    ...(matches.length ? {} : { message: `"${q}" was not found in FoodNetBD.` }),
    source: nutritionSource(db),
    note: 'Carbohydrate values are averages for the food as listed; portions and recipes vary.',
  };
}

/** check_expiry: the app's pack parser (an MFG date is never taken as the expiry). */
export function checkExpiry(dateText: string, today: Date) {
  const text = clip(dateText, LIMITS.dateText);
  const r = expiryFromText(text, today);
  const status = r.status === 'expired' ? 'expired' : r.status === 'expiresSoon' ? 'expiring_soon' : r.status === 'ok' ? 'ok' : 'not_readable';
  const message = {
    expired: `Expired (${r.exp}). Do not use it without asking a pharmacist.`,
    expiring_soon: `Expires within ${EXPIRY.soonMonths} months (${r.exp}).`,
    ok: `OK until ${r.exp}.`,
    not_readable: 'Expiry date not readable — please check the pack. (A manufacturing date is never used as the expiry.)',
  }[status];
  return { date_text: text, status, expiry: r.exp, manufactured: r.mfg, expiring_soon_window_months: EXPIRY.soonMonths, message, checked_on: today.toISOString().slice(0, 10) };
}

/** Rules 1–3 on any text a tool returns (dataset text included): never a verdict, dose change or diagnosis. */
export function assertSafe(text: string): string {
  if (/\b(?:fake|genuine|counterfeit)\b|নকল|ভেজাল/i.test(text)) throw new Error('unsafe: authenticity verdict');
  if (/\byou (?:have|are suffering from)\b/i.test(text)) throw new Error('unsafe: diagnosis');
  if (/\b(?:increase|reduce|decrease|double|stop|start)\s+(?:the|your)\s+(?:dose|insulin|medicine)\b/i.test(text)) throw new Error('unsafe: dose advice');
  return text;
}
