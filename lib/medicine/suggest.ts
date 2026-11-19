/**
 * Medicine-name suggestions without any AI key (pure, unit-tested):
 * - autocomplete after 2 letters over brand AND generic names,
 * - Bangla-friendly: names typed in Bangla script ("নাপা", "মেটফরমিন") are transliterated and matched phonetically,
 * - fuzzy matching of OCR text to the closest name ("Metfrmin" → Metformin).
 * Everything here is a SUGGESTION: the user picks and confirms (rule 7).
 */
import { editDistance, foldOcrConfusions, maxTypos } from './fuzzy';
import { nameKey } from './normalise';

export type NameKind = 'brand' | 'generic';

export interface NameEntry {
  /** Display name, e.g. "Napa" or "Metformin Hydrochloride". */
  name: string;
  kind: NameKind;
  /** Generic of a brand (null if unknown); for a generic, its own name. */
  generic: string | null;
  /** generics.id for generic entries (used for generic-only matches). */
  genericId?: number;
}

interface IndexedEntry extends NameEntry {
  keys: string[];
  phon: string[];
}

export interface NameIndex {
  entries: IndexedEntry[];
}

export interface Suggestion extends NameEntry {
  score: number;
}

const BANGLA = /[ঀ-৿]/;
export const hasBangla = (s: string) => BANGLA.test(s);

/** Salt / form words that are dropped to give a short alias ("Metformin Hydrochloride" → "metformin"). */
const SALTS = new Set(['hydrochloride', 'hcl', 'sodium', 'potassium', 'calcium', 'magnesium', 'maleate', 'besilate', 'besylate', 'mesylate', 'citrate', 'sulphate', 'sulfate', 'phosphate', 'succinate', 'tartrate', 'fumarate', 'acetate', 'bromide', 'monohydrate', 'dihydrate', 'trihydrate', 'hydrobromide', 'bisulfate', 'dipropionate', 'propionate']);

/** Search keys for a name: its key, plus the salt-free alias for single-ingredient generics. */
export function aliasKeys(name: string): string[] {
  const key = nameKey(name);
  const keys = new Set([key]);
  if (!name.includes('+')) {
    const words = key.split(' ').filter((w) => !SALTS.has(w));
    if (words.length) keys.add(words.join(' '));
  }
  return [...keys].filter(Boolean);
}

// ---------- Bangla → Latin ----------

const INDEPENDENT: Record<string, string> = { অ: 'o', আ: 'a', ই: 'i', ঈ: 'i', উ: 'u', ঊ: 'u', ঋ: 'ri', এ: 'e', ঐ: 'oi', ও: 'o', ঔ: 'ou' };
const SIGNS: Record<string, string> = { 'া': 'a', 'ি': 'i', 'ী': 'i', 'ু': 'u', 'ূ': 'u', 'ৃ': 'ri', 'ে': 'e', 'ৈ': 'oi', 'ো': 'o', 'ৌ': 'ou' };
const CONSONANTS: Record<string, string> = {
  ক: 'k', খ: 'kh', গ: 'g', ঘ: 'gh', ঙ: 'ng', চ: 'c', ছ: 'ch', জ: 'j', ঝ: 'jh', ঞ: 'n', ট: 't', ঠ: 'th', ড: 'd', ঢ: 'dh', ণ: 'n',
  ত: 't', থ: 'th', দ: 'd', ধ: 'dh', ন: 'n', প: 'p', ফ: 'f', ব: 'b', ভ: 'bh', ম: 'm', য: 'j', র: 'r', ল: 'l', শ: 'sh', ষ: 'sh',
  স: 's', হ: 'h', '\uE000': 'r', '\uE001': 'y',
};
const OTHER: Record<string, string> = { 'ৎ': 't', 'ং': 'ng', 'ঃ': 'h', 'ঁ': '', '্': '' };
const HASANTA = '্';
const INHERENT = '\u0001';

/** Bangla script → Latin with a marker where the inherent vowel may or may not be spoken. */
function transliterateRaw(text: string): string {
  // ড় / ঢ় / য় may arrive precomposed or as base + nukta (NFC keeps them decomposed): use private placeholders.
  const chars = [
    ...text
      .normalize('NFC')
      .replace(/\u09DC|\u09A1\u09BC|\u09DD|\u09A2\u09BC/g, '\uE000')
      .replace(/\u09DF|\u09AF\u09BC/g, '\uE001'),
  ];
  let out = '';
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]!;
    const next = chars[i + 1];
    const cons = CONSONANTS[ch];
    if (cons !== undefined) {
      // য-ফলা (্য) and ব-ফলা (্ব) after a consonant are usually silent in borrowed names: "প্যারা" → "para".
      if (i > 0 && chars[i - 1] === HASANTA && (ch === 'য' || ch === 'ব') && CONSONANTS[chars[i - 2] ?? ''] !== undefined) {
        out = out.replace(/\u0001$/, '');
      } else {
        out += cons;
      }
      if (next === undefined || !(next in SIGNS || next === HASANTA)) out += INHERENT;
      continue;
    }
    if (ch === HASANTA) {
      out = out.replace(/\u0001$/, '');
      continue;
    }
    if (SIGNS[ch] !== undefined) out += SIGNS[ch];
    else if (INDEPENDENT[ch] !== undefined) out += INDEPENDENT[ch];
    else if (OTHER[ch] !== undefined) out += OTHER[ch];
    else if (/[০-৯]/.test(ch)) out += String(ch.charCodeAt(0) - 0x09e6);
    else out += ch;
  }
  return out;
}

/** Latin readings of a Bangla name: the inherent vowel dropped, read as "o", or read as "a" (never at word end). */
export function banglaToLatin(text: string): string[] {
  const raw = transliterateRaw(text).replace(/\u0001(?=\s|$|[^a-z\u0001])/g, '');
  return [...new Set(['', 'o', 'a'].map((v) => raw.replaceAll(INHERENT, v).toLowerCase().replace(/\s+/g, ' ').trim()))].filter(Boolean);
}

// ---------- phonetic key ----------

/** Sound-alike key so Bangla readings and Latin spellings meet: "paracetamol" ≈ "parasitamol", "seclo" ≈ "seklo". */
export function phoneticKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .replace(/ph/g, 'f')
    .replace(/ck/g, 'k')
    .replace(/c(?=[eiy])/g, 's')
    .replace(/(?<=[kgjtdbsc])h/g, '')
    .replace(/c/g, 'k')
    .replace(/q/g, 'k')
    .replace(/x/g, 'ks')
    .replace(/z/g, 'j')
    .replace(/v/g, 'b')
    .replace(/w/g, 'o')
    .replace(/y/g, 'i')
    .replace(/ee/g, 'i')
    .replace(/oo/g, 'u')
    .replace(/e/g, 'i')
    .replace(/(.)\1+/g, '$1');
}

export function buildNameIndex(entries: readonly NameEntry[]): NameIndex {
  return {
    entries: entries.map((e) => {
      const keys = aliasKeys(e.name);
      return { ...e, keys, phon: [...new Set(keys.map(phoneticKey))] };
    }),
  };
}

/** Score of one query key against one name key (lower is better; null = no match). */
function scoreKey(q: string, key: string, allowPrefix: boolean): number | null {
  if (key === q) return 0;
  if (allowPrefix && q.length >= 2 && key.startsWith(q)) return 1 + Math.min(1, (key.length - q.length) * 0.1);
  const allowed = maxTypos(q.length);
  if (allowed > 0) {
    // Edit distance is at least the length difference: skip hopeless pairs cheaply.
    if (Math.abs(q.length - key.length) <= allowed) {
      const d = editDistance(q, key);
      if (d <= allowed) return 2 + d;
    }
    // OCR or a typo in a short prefix of a longer name ("metfr" → "metformin") while typing.
    if (allowPrefix && key.length > q.length) {
      const dp = editDistance(q, key.slice(0, q.length));
      if (dp <= Math.max(1, allowed - 1)) return 3 + dp;
    }
    const first = key.split(' ')[0]!;
    if (first !== key && Math.abs(q.length - first.length) <= allowed) {
      const df = editDistance(q, first);
      if (df <= allowed) return 3 + df;
    }
  }
  return null;
}

function rank(variants: { key: string; phon: string; penalty: number }[], index: NameIndex, allowPrefix: boolean, limit: number): Suggestion[] {
  const best = new Map<string, Suggestion>();
  for (const e of index.entries) {
    let score: number | null = null;
    for (const v of variants) {
      for (const k of e.keys) {
        const s = scoreKey(v.key, k, allowPrefix);
        if (s !== null && (score === null || s + v.penalty < score)) score = s + v.penalty;
      }
      for (const p of e.phon) {
        const s = v.phon ? scoreKey(v.phon, p, allowPrefix) : null;
        if (s !== null && (score === null || s + 0.5 + v.penalty < score)) score = s + 0.5 + v.penalty;
      }
    }
    if (score === null) continue;
    const id = `${e.kind}:${e.name.toLowerCase()}`;
    const prev = best.get(id);
    if (!prev || score < prev.score) {
      best.set(id, { name: e.name, kind: e.kind, generic: e.generic, ...(e.genericId !== undefined ? { genericId: e.genericId } : {}), score });
    }
  }
  return [...best.values()].sort(order).slice(0, limit);
}

const order = (a: Suggestion, b: Suggestion) =>
  a.score - b.score || a.name.length - b.name.length || (a.kind === b.kind ? 0 : a.kind === 'generic' ? -1 : 1) || a.name.localeCompare(b.name);

/** Many brands share a prefix ("Metfo", "Metfar", …): keep room for the generic name(s) the user may mean. */
function withGenerics(all: Suggestion[], limit: number): Suggestion[] {
  const top = all.slice(0, limit);
  const missing = all.filter((x) => x.kind === 'generic').slice(0, Math.min(GENERIC_SLOTS, limit)).filter((g) => !top.includes(g));
  if (!missing.length) return top;
  const generics = top.filter((x) => x.kind === 'generic');
  const brands = top.filter((x) => x.kind === 'brand').slice(0, limit - generics.length - missing.length);
  return [...generics, ...missing, ...brands].sort(order);
}

/** Places kept for generic names in a suggestion list. */
const GENERIC_SLOTS = 2;

function queryVariantsFor(query: string) {
  if (hasBangla(query)) {
    // Bangla readings only match phonetically; each is equally likely.
    return banglaToLatin(query).map((latin) => ({ key: nameKey(latin), phon: phoneticKey(latin), penalty: 0.25 }));
  }
  const key = nameKey(query);
  return [{ key, phon: phoneticKey(key), penalty: 0 }];
}

/** Autocomplete for the medicine-name field (2+ letters; Latin or Bangla). */
export function suggestNames(query: string, index: NameIndex, limit = 8): Suggestion[] {
  const variants = queryVariantsFor(query).filter((v) => v.key.replace(/\s/g, '').length >= 2);
  if (!variants.length) return [];
  return withGenerics(rank(variants, index, true, limit * 5), limit);
}

/**
 * Closest medicine name to a word read by OCR ("Metfrmin" → Metformin Hydrochloride / brand), or null if nothing
 * is close enough. No prefix matches: the whole word must be the same name, allowing typos and OCR confusions.
 */
export function closestName(text: string, index: NameIndex): Suggestion | null {
  const base = nameKey(text).replace(/\s*\d.*$/, '').trim(); // "napa500" → "napa"
  if (base.replace(/\s/g, '').length < 3) return null;
  const keys = new Set([base, foldOcrConfusions(base)]);
  const variants = [...keys].map((key) => ({ key, phon: phoneticKey(key), penalty: 0 }));
  const best = rank(variants, index, false, 1)[0];
  // Exact, one typo / OCR slip, or a sound-alike: anything looser is more likely another word (a name, "days").
  return best && best.score <= CLOSEST_MAX_SCORE ? best : null;
}

/** Highest score closestName accepts (2 + one edit, or a phonetic match with one edit). */
export const CLOSEST_MAX_SCORE = 3.5;
