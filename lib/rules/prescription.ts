/**
 * Rules on the prescription list AFTER the user has confirmed every line (rule 7). Deterministic, no AI.
 * Findings are things to discuss with a doctor or pharmacist — never advice to stop, start or change a medicine
 * (rule 3). The doctor's written diagnosis is shown as written and overrides any general link (rule 4).
 */
import { ALLERGY_GROUPS } from '@/config/allergy-groups';
import { INTERACTIONS, type InteractionSeverity } from '@/config/interactions';
import { MEDICINE_TEST_LINKS, type LinkEffect } from '@/config/medicine-test-links';
import { nameKey } from '@/lib/medicine/normalise';
import type { CheckedValue } from './report-ranges';

export interface ConfirmedMedicine {
  /** Line id in the UI. */
  lineId: string;
  /** Brand (or name) as confirmed by the user. */
  brand: string;
  /** Generic from the database; null when the line was not matched to the database. */
  generic: string | null;
  strength: string;
  form: string;
  frequency: string;
  duration: string;
  pregnancyCategory: string | null;
}

export interface HealthProfile {
  allergies: readonly string[];
  pregnant: boolean;
}

export type PrescriptionFinding =
  | { code: 'duplicateIngredient'; ingredient: string; brands: string[] }
  | { code: 'interaction'; id: string; severity: InteractionSeverity; brands: [string, string] }
  | { code: 'allergy'; allergy: string; brand: string }
  | { code: 'pregnancy'; brand: string; category: string }
  | { code: 'notInDatabase'; brand: string };

/** Ingredients of a generic: "Paracetamol + Caffeine" → ["paracetamol", "caffeine"]. */
export function ingredients(generic: string | null): string[] {
  if (!generic) return [];
  return generic
    .split(/\+|\band\b|,/i)
    .map((g) => nameKey(g))
    .filter(Boolean);
}

/** True if a term (e.g. "warfarin") appears as whole words in an ingredient ("warfarin sodium"). */
export function containsTerm(ingredient: string, term: string): boolean {
  const t = nameKey(term);
  return t.length > 0 && ` ${ingredient} `.includes(` ${t} `);
}

/** Core name for duplicate checks: salts and release forms removed ("metformin hydrochloride xr" → "metformin"). */
export function coreIngredient(ingredient: string): string {
  return ingredient
    .replace(
      /\b(hydrochloride|hcl|hydrobromide|sodium|potassium|calcium|magnesium|maleate|besylate|besilate|mesylate|succinate|tartrate|citrate|fumarate|sulphate|sulfate|bp|usp|monohydrate|dihydrate|trihydrate|anhydrous)\b/g,
      ' ',
    )
    .replace(/\b(extended|sustained|modified|delayed|prolonged|controlled|immediate)\s+release\b|\b(xr|sr|er|mr|dr|cr|ir)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Same ingredient on more than one line, including inside combinations (Napa Extra + Ace → paracetamol twice). */
export function findDuplicateIngredients(meds: readonly ConfirmedMedicine[]): PrescriptionFinding[] {
  const byIngredient = new Map<string, string[]>();
  for (const m of meds) {
    for (const ing of new Set(ingredients(m.generic).map(coreIngredient))) {
      if (!ing) continue;
      const list = byIngredient.get(ing) ?? [];
      list.push(m.brand);
      byIngredient.set(ing, list);
    }
  }
  return [...byIngredient.entries()]
    .filter(([, brands]) => brands.length > 1)
    .map(([ingredient, brands]) => ({ code: 'duplicateIngredient', ingredient, brands }));
}

export function findInteractions(meds: readonly ConfirmedMedicine[]): PrescriptionFinding[] {
  const out: PrescriptionFinding[] = [];
  const ings = meds.map((m) => ingredients(m.generic));
  const has = (i: number, terms: readonly string[]) => ings[i]!.some((ing) => terms.some((t) => containsTerm(ing, t)));
  const which = (i: number, terms: readonly string[]) =>
    terms.find((t) => ings[i]!.some((ing) => containsTerm(ing, t)));

  for (const rule of INTERACTIONS) {
    for (let i = 0; i < meds.length; i++) {
      for (let j = i + 1; j < meds.length; j++) {
        let hit = false;
        if (rule.a && rule.b) hit = (has(i, rule.a) && has(j, rule.b)) || (has(i, rule.b) && has(j, rule.a));
        if (rule.group) {
          const x = which(i, rule.group);
          const y = which(j, rule.group);
          hit = Boolean(x && y && x !== y);
        }
        if (hit) out.push({ code: 'interaction', id: rule.id, severity: rule.severity, brands: [meds[i]!.brand, meds[j]!.brand] });
      }
    }
  }
  return out;
}

/** Allergy terms that apply to a medicine: by brand, by ingredient name, or by allergy group (e.g. "penicillin"). */
export function findAllergies(meds: readonly ConfirmedMedicine[], allergies: readonly string[]): PrescriptionFinding[] {
  const out: PrescriptionFinding[] = [];
  for (const raw of allergies) {
    const term = nameKey(raw);
    if (term.length < 3) continue;
    const group = ALLERGY_GROUPS.find((g) => g.aliases.some((a) => nameKey(a) === term || a === raw.trim()));
    const terms = group ? [...group.ingredients] : [term];
    for (const m of meds) {
      const ings = ingredients(m.generic);
      const brandHit = nameKey(m.brand) === term;
      const ingHit = ings.some((ing) => terms.some((t) => containsTerm(ing, t)));
      if (brandHit || ingHit) out.push({ code: 'allergy', allergy: raw.trim(), brand: m.brand });
    }
  }
  return out;
}

/** Pregnancy: flags medicines whose (older FDA letter) category in the database includes D or X. */
export function findPregnancyFlags(meds: readonly ConfirmedMedicine[], pregnant: boolean): PrescriptionFinding[] {
  if (!pregnant) return [];
  return meds
    .filter((m) => m.pregnancyCategory && /[DX]/.test(m.pregnancyCategory))
    .map((m) => ({ code: 'pregnancy', brand: m.brand, category: m.pregnancyCategory! }));
}

export function checkPrescription(meds: readonly ConfirmedMedicine[], profile: HealthProfile): PrescriptionFinding[] {
  return [
    ...findAllergies(meds, profile.allergies),
    ...findPregnancyFlags(meds, profile.pregnant),
    ...findInteractions(meds),
    ...findDuplicateIngredients(meds),
    ...meds.filter((m) => !m.generic).map((m): PrescriptionFinding => ({ code: 'notInDatabase', brand: m.brand })),
  ];
}

// ---------------------------------------------------------------------------------------------------------------
// Report ↔ prescription: which medicine commonly relates to which out-of-range value

export type Relation =
  | { kind: 'related'; test: string; status: 'high' | 'low'; brands: string[]; linkId: string; effect: LinkEffect }
  | { kind: 'doesNotFit'; test: string; status: 'high' | 'low'; brands: string[]; linkId: string; effect: LinkEffect }
  | { kind: 'noLinkedMedicine'; test: string; status: 'high' | 'low' };

/**
 * For each out-of-range value: the prescribed medicines commonly used for it ("related"), or medicines that usually
 * push it further the same way ("doesNotFit", e.g. a sugar-lowering medicine with LOW sugar), or none.
 * Anything that does not fit gets "Ask your doctor; do not stop on your own" in the UI.
 */
export function relateReportToPrescription(values: readonly CheckedValue[], meds: readonly ConfirmedMedicine[]): Relation[] {
  const out: Relation[] = [];
  for (const v of values) {
    if (v.status !== 'high' && v.status !== 'low') continue;
    const label = v.name;
    const status = v.status;
    let found = false;
    for (const link of MEDICINE_TEST_LINKS) {
      if (!v.key || !link.tests.includes(v.key)) continue;
      const brands = meds
        .filter((m) => ingredients(m.generic).some((ing) => link.ingredients.some((t) => containsTerm(ing, t))))
        .map((m) => m.brand);
      if (!brands.length) continue;
      found = true;
      const fits =
        link.effect === 'monitored' || (link.effect === 'lowers' && status === 'high') || (link.effect === 'raises' && status === 'low');
      out.push({ kind: fits ? 'related' : 'doesNotFit', test: label, status, brands, linkId: link.id, effect: link.effect });
    }
    if (!found) out.push({ kind: 'noLinkedMedicine', test: label, status });
  }
  return out;
}
