/**
 * Which medicine is in a pack photo? Verified against the medicine database; neither OCR nor the vision model is
 * trusted on its own.
 *
 * 1. Brand: every brand phrase read (largest text first) is matched to database brands — as written, OCR-folded,
 *    and with spaces removed ("No Pain" → "Nopain").
 * 2. Cross-check each candidate product against the printed text: generic (and salt), strength, dosage form and
 *    manufacturer. A candidate that CONTRADICTS the pack (other ingredient, strength or form) loses.
 * 3. Verdict: strong (named), weak (the user chooses from the top candidates or types the name) or none
 *    (not in the database). Every decision is written to `log`, so a wrong match can be explained.
 */
import type Database from 'better-sqlite3';
import { PACK_IDENTIFY } from '@/config/pack-identify';
import { manufacturerCore, closestPrintedText } from '@/lib/rules/medicine';
import { editDistance, foldOcrConfusions, maxTypos, queryVariants, rankKeys } from './fuzzy';
import { formKey, nameKey, strengthKey } from './normalise';
import type { Product } from './repo';

export interface PackEvidence {
  source: 'vision' | 'ocr';
  /** Brand phrases, most prominent first (vision: the model's brand first, then printed lines). */
  brandTexts: string[];
  generic?: string;
  strength?: string;
  form?: string;
  manufacturer?: string;
  /** All text seen on the pack (OCR text, or the model's exact transcription). */
  text: string;
}

export type CheckResult = 'match' | 'contradicts' | 'unknown';

export interface ScoredCandidate {
  product: Product;
  /** How the brand matched what was read: same name (spaces ignored), a small typo, or only partly (prefix etc.). */
  brandMatch: 'exact' | 'typo' | 'partial';
  /** The phrase that matched the brand, and how (lower = better). */
  brandPhrase: string;
  brandScore: number;
  checks: { generic: CheckResult; strength: CheckResult; form: CheckResult; manufacturer: CheckResult };
  contradicts: boolean;
  corroborations: number;
  total: number;
}

export interface Identification {
  verdict: 'strong' | 'weak' | 'none';
  best: ScoredCandidate | null;
  /** Up to PACK_IDENTIFY.offer candidates to choose from (non-contradicting first). */
  candidates: ScoredCandidate[];
  log: string[];
}

// ---------- printed details ----------

const SALTS = ['sodium', 'potassium', 'calcium', 'magnesium', 'hydrochloride', 'hcl', 'maleate', 'besilate', 'besylate', 'mesylate', 'citrate', 'sulphate', 'sulfate', 'phosphate', 'succinate', 'tartrate', 'fumarate', 'acetate', 'bromide', 'hydrobromide', 'bisulfate', 'propionate', 'dipropionate', 'trihydrate', 'monohydrate'];
const SALT_SET = new Set(SALTS);

/** Dosage-form groups; a pack and a product must fall in the same group. */
const FORM_GROUPS: Array<[group: string, words: RegExp]> = [
  ['eye', /\beye\b|\bophthalmic\b/],
  ['ear', /\bear\b|\botic\b/],
  ['nasal', /\bnasal\b|\bnose\b/],
  ['tablet', /\btab(?:let)?s?\b|\bcaplets?\b/],
  ['capsule', /\bcap(?:sule)?s?\b/],
  ['syrup', /\bsyrup\b|\belixir\b/],
  ['suspension', /\bsuspension\b|\bsusp\b/],
  ['injection', /\binjection\b|\binj\b|\bampoule\b|\bvial\b|\binfusion\b/],
  ['cream', /\bcream\b/],
  ['ointment', /\bointment\b|\boint\b/],
  ['gel', /\bgel\b/],
  ['inhaler', /\binhaler\b|\binhalation\b|\brespirator\b/],
  ['suppository', /\bsuppositor(?:y|ies)\b/],
  ['sachet', /\bsachet\b|\bpowder\b|\bgranules\b/],
  ['drops', /\bdrops?\b/],
  ['solution', /\bsolution\b|\blotion\b/],
];

function formGroups(text: string): Set<string> {
  const t = nameKey(text);
  const out = new Set<string>();
  for (const [g, re] of FORM_GROUPS) if (re.test(t)) out.add(g);
  // "Eye drops" is the eye group, not generic drops.
  if (out.has('eye') || out.has('ear') || out.has('nasal')) out.delete('drops');
  return out;
}

function productFormGroup(form: string): string | null {
  const g = formGroups(formKey(form));
  return g.size ? [...g][0]! : null;
}

const STRENGTH_RE = /(\d+(?:\.\d+)?)\s*(mcg|µg|mg|gm|g|ml|iu|%)(?![a-z])/gi;
function strengthsIn(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(STRENGTH_RE)) out.add(strengthKey(`${m[1]}${m[2]}`));
  return out;
}
function productStrengthParts(strength: string): string[] {
  return [...strengthsIn(strength)];
}

/** Core ingredient words of a generic name ("Diclofenac Sodium + Misoprostol" → diclofenac, misoprostol). */
export function ingredientWords(generic: string | null): string[] {
  if (!generic) return [];
  return generic
    .split('+')
    .map((part) => nameKey(part).split(' ').find((w) => w.length >= 4 && !SALT_SET.has(w) && !/^\d/.test(w)) ?? '')
    .filter(Boolean);
}
const saltWords = (s: string) => nameKey(s).split(' ').filter((w) => SALT_SET.has(w));

// ---------- caches over the database ----------

interface DbCache {
  keys: string[];
  compact: Map<string, string[]>;
  ingredients: Set<string>;
}
const caches = new WeakMap<Database.Database, DbCache>();
function cache(db: Database.Database): DbCache {
  let c = caches.get(db);
  if (!c) {
    const keys = (db.prepare('SELECT DISTINCT brand_key FROM products').pluck().all() as string[]).filter(Boolean);
    const compact = new Map<string, string[]>();
    for (const k of keys) {
      const ck = k.replace(/ /g, '');
      compact.set(ck, [...(compact.get(ck) ?? []), k]);
    }
    const ingredients = new Set<string>();
    for (const g of db.prepare('SELECT name FROM generics').pluck().all() as string[]) for (const w of ingredientWords(g)) ingredients.add(w);
    c = { keys, compact, ingredients };
    caches.set(db, c);
  }
  return c;
}

/** Ingredient words printed on the pack (exact, or one OCR slip for long words). */
function packIngredients(text: string, known: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const raw of nameKey(text).split(' ')) {
    const w = foldOcrConfusions(raw);
    if (w.length < 4) continue;
    if (known.has(w)) out.add(w);
    else if (w.length >= 8) for (const k of known) if (Math.abs(k.length - w.length) <= 1 && editDistance(k, w) <= 1) out.add(k);
  }
  return out;
}

// ---------- brand matching ----------

interface BrandHit {
  key: string;
  score: number;
  phrase: string;
  match: 'exact' | 'typo' | 'partial';
}

/** Same name (ignoring spaces and OCR slips), one small typo, or only partly the same. */
function matchKind(phraseKey: string, key: string): BrandHit['match'] {
  const variants = [phraseKey, foldOcrConfusions(phraseKey)].map((v) => v.replace(/ /g, ''));
  const k = key.replace(/ /g, '');
  if (variants.includes(k)) return 'exact';
  // A typo only counts for names of 5+ letters: "Pain" vs "Paino" is too short to tell a slip from another brand.
  if (variants[0]!.length < 5) return 'partial';
  const d = Math.min(...variants.map((v) => editDistance(v, k)));
  return d <= maxTypos(k.length) && d <= maxTypos(variants[0]!.length) ? 'typo' : 'partial';
}

function brandHits(evidence: PackEvidence, c: DbCache, log: string[]): BrandHit[] {
  const best = new Map<string, BrandHit>();
  const add = (key: string, score: number, phrase: string) => {
    const prev = best.get(key);
    if (!prev || score < prev.score) best.set(key, { key, score, phrase, match: matchKind(nameKey(phrase), key) });
  };
  evidence.brandTexts.slice(0, 12).forEach((phrase, i) => {
    const penalty = i * PACK_IDENTIFY.prominencePenalty;
    const found: string[] = [];
    for (const v of queryVariants(nameKey(phrase))) {
      if (v.length < 2) continue;
      for (const r of rankKeys(v, c.keys, 6)) {
        add(r.key, r.score + penalty, phrase);
        found.push(`${r.key}:${r.score.toFixed(2)}`);
      }
      // Same letters, different spacing: "no pain" ↔ "nopain", "napa extra" ↔ "napaextra".
      const cv = v.replace(/ /g, '');
      if (cv.length >= 4 && cv !== v) {
        for (const k of c.compact.get(cv) ?? []) {
          add(k, 0 + penalty, phrase);
          found.push(`${k}:0 (spaces ignored)`);
        }
        const allowed = maxTypos(cv.length);
        if (allowed > 0) {
          for (const [ck, ks] of c.compact) {
            if (Math.abs(ck.length - cv.length) > allowed || ck === cv) continue;
            const d = editDistance(cv, ck);
            if (d > allowed) continue;
            for (const k of ks) {
              add(k, 1 + d + penalty, phrase);
              found.push(`${k}:${1 + d} (spaces ignored)`);
            }
          }
        }
      }
    }
    log.push(`phrase #${i + 1} "${phrase}" (penalty ${penalty.toFixed(1)}) → ${found.length ? [...new Set(found)].slice(0, 8).join(', ') : 'no brand'}`);
  });
  return [...best.values()].sort((a, b) => a.score - b.score);
}

// ---------- scoring ----------

function check(product: Product, evidence: PackEvidence, c: DbCache): ScoredCandidate['checks'] {
  const text = [evidence.text, evidence.generic, evidence.strength, evidence.form, evidence.manufacturer].filter(Boolean).join('\n');

  // Generic (and salt): what ingredients does the pack name?
  let generic: CheckResult = 'unknown';
  const printed = packIngredients(text, c.ingredients);
  const own = ingredientWords(product.generic);
  if (own.length && printed.size) {
    const shared = own.filter((w) => printed.has(w));
    if (shared.length === 0) generic = 'contradicts';
    else if (shared.length === own.length) {
      generic = 'match';
      // Same ingredient, different salt (Diclofenac Potassium vs Diclofenac Sodium) → contradicts.
      const ingredientLines = text.split('\n').filter((l) => own.some((w) => nameKey(l).includes(w)));
      const packSalts = new Set(ingredientLines.flatMap(saltWords));
      const ownSalts = saltWords(product.generic ?? '');
      if (ownSalts.length && packSalts.size && !ownSalts.some((s) => packSalts.has(s))) generic = 'contradicts';
    }
  }

  let strength: CheckResult = 'unknown';
  const packStrengths = strengthsIn(text);
  const parts = productStrengthParts(product.strength);
  if (parts.length && packStrengths.size) strength = parts.every((p) => packStrengths.has(p)) ? 'match' : parts.some((p) => packStrengths.has(p)) ? 'unknown' : 'contradicts';

  let form: CheckResult = 'unknown';
  const packForms = formGroups(text);
  const own_ = productFormGroup(product.form);
  if (own_ && packForms.size) form = packForms.has(own_) ? 'match' : 'contradicts';

  let manufacturer: CheckResult = 'unknown';
  const core = product.manufacturer ? manufacturerCore(product.manufacturer) : '';
  if (core.length >= 3) {
    const found = closestPrintedText(text, core);
    if (found && found.distance <= (core.length >= 6 ? 1 : 0)) manufacturer = 'match';
  }
  return { generic, strength, form, manufacturer };
}

function describe(c: ScoredCandidate): string {
  const p = c.product;
  const checks = Object.entries(c.checks)
    .filter(([, v]) => v !== 'unknown')
    .map(([k, v]) => `${k} ${v}`)
    .join(', ');
  return `${p.brand} ${p.strength || '?'} ${p.form} (${p.generic ?? 'generic unknown'}): brand ${c.brandMatch} ${c.brandScore.toFixed(2)} via "${c.brandPhrase}"${checks ? `; ${checks}` : ''} → ${c.total.toFixed(2)}${c.contradicts ? ' [contradicts the pack]' : ''}`;
}

/** Identifies the medicine in a pack from what was read. `loadProducts` returns the products of a brand key. */
export function identifyPack(db: Database.Database, evidence: PackEvidence, loadProducts: (brandKey: string) => Product[]): Identification {
  const c = cache(db);
  const log: string[] = [`source: ${evidence.source}`, `brand phrases (largest first): ${evidence.brandTexts.map((b) => `"${b}"`).join(', ') || 'none'}`];
  if (evidence.generic || evidence.strength || evidence.form || evidence.manufacturer) {
    log.push(`fields: generic "${evidence.generic ?? ''}", strength "${evidence.strength ?? ''}", form "${evidence.form ?? ''}", maker "${evidence.manufacturer ?? ''}"`);
  }
  const hits = brandHits(evidence, c, log).filter((h) => h.score <= PACK_IDENTIFY.weakBrandMaxScore + 2).slice(0, 10);

  const scored: ScoredCandidate[] = [];
  for (const h of hits) {
    for (const product of loadProducts(h.key)) {
      const checks = check(product, evidence, c);
      const values = Object.values(checks);
      const contradicts = values.includes('contradicts');
      const corroborations = values.filter((v) => v === 'match').length;
      const total =
        10 -
        h.score * 2 +
        (checks.generic === 'match' ? 3 : 0) +
        (checks.strength === 'match' ? 2 : 0) +
        (checks.form === 'match' ? 1 : 0) +
        (checks.manufacturer === 'match' ? 1.5 : 0) -
        values.filter((v) => v === 'contradicts').length * 10;
      scored.push({ product, brandMatch: h.match, brandPhrase: h.phrase, brandScore: h.score, checks, contradicts, corroborations, total });
    }
  }
  scored.sort((a, b) => Number(a.contradicts) - Number(b.contradicts) || b.total - a.total || a.brandScore - b.brandScore);
  for (const s of scored.slice(0, 12)) log.push(`candidate: ${describe(s)}`);

  // A candidate is related to the pack only if its brand is (nearly) what was read, or a printed detail agrees.
  // Unrelated look-alikes ("Pain" → Paino) are never offered.
  const related = (s: ScoredCandidate) => s.brandMatch !== 'partial' || s.corroborations >= 1;
  const plausible = scored.filter((s) => !s.contradicts && related(s) && (s.brandScore <= PACK_IDENTIFY.weakBrandMaxScore || s.checks.generic === 'match'));
  const best = plausible[0] ?? null;
  const offer = plausible.slice(0, PACK_IDENTIFY.offer);

  if (!best) {
    log.push('verdict: none — no database medicine agrees with the pack');
    return { verdict: 'none', best: null, candidates: [], log };
  }
  const runnerUp = plausible[1];
  const margin = runnerUp ? best.total - runnerUp.total : Infinity;
  const strong =
    best.brandMatch !== 'partial' &&
    best.brandScore <= PACK_IDENTIFY.strongBrandMaxScore && best.corroborations >= PACK_IDENTIFY.minCorroborations && margin >= PACK_IDENTIFY.minMargin;
  log.push(
    `verdict: ${strong ? 'strong' : 'weak'} — best ${best.product.brand} ${best.product.strength} (brand ${best.brandScore.toFixed(2)}, ${best.corroborations} printed details agree, margin ${Number.isFinite(margin) ? margin.toFixed(2) : 'none'} over ${runnerUp ? `${runnerUp.product.brand} ${runnerUp.product.strength}` : 'no other candidate'})`,
  );
  return { verdict: strong ? 'strong' : 'weak', best, candidates: offer, log };
}
