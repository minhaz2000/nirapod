/** Edit distance and fuzzy brand ranking. Used by brand search and by the spelling-mismatch check. */

/** Optimal-string-alignment (Damerau–Levenshtein) distance: insert, delete, substitute, swap adjacent. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, (_, i) => {
    const row = new Array<number>(cols).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j < cols; j++) d[0]![j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2]![j - 2]! + 1);
      d[i]![j] = v;
    }
  }
  return d[a.length]![b.length]!;
}

/** How many edits a word of this length may have and still count as "the same word, misspelt". */
export function maxTypos(length: number): number {
  if (length <= 3) return 0;
  if (length <= 5) return 1;
  if (length <= 9) return 2;
  return 3;
}

export interface RankedKey {
  key: string;
  score: number;
}

/**
 * Ranks brand keys against a query key (both already normalised with nameKey).
 * Lower score is better: exact 0; typo match 1 + distance; prefix 1.5 + 0.25 per extra letter (max 3);
 * brand's first word matched 3 + distance; substring 6. Typos rank level with short prefixes so an OCR misread
 * ("nopa") still finds the brand ("napa") next to longer brands that merely start with the same letters.
 */
export function rankKeys(query: string, keys: readonly string[], limit = 10): RankedKey[] {
  if (!query) return [];
  const allowed = maxTypos(query.length);
  const out: RankedKey[] = [];
  for (const key of keys) {
    let score: number | null = null;
    if (key === query) score = 0;
    else if (query.length >= 2 && key.startsWith(query)) score = 1.5 + Math.min(1.5, (key.length - query.length) * 0.25);
    else {
      // The distance is at least the length difference: skip the full computation when it cannot be a typo.
      const d = Math.abs(query.length - key.length) <= allowed ? editDistance(query, key) : Infinity;
      if (d <= allowed) score = 1 + d;
      else if (query.length >= 4 && key.includes(query)) score = 6;
      else {
        // OCR often joins the brand to the next word ("napa500", "napaextra"): compare against the key's first word.
        const first = key.split(' ')[0]!;
        const df = Math.abs(query.length - first.length) <= allowed ? editDistance(query, first) : Infinity;
        if (first !== key && df <= allowed) score = 3 + df;
      }
    }
    if (score !== null) out.push({ key, score });
  }
  return out.sort((a, b) => a.score - b.score || a.key.length - b.key.length || a.key.localeCompare(b.key)).slice(0, limit);
}

/**
 * Undoes common printed-text OCR confusions in a lower-case key:
 * "rn" read for "m", "vv" for "w", and 0 / 1 / 5 read inside a word for o / l / s.
 */
export function foldOcrConfusions(key: string): string {
  return key
    .replace(/rn/g, 'm')
    .replace(/vv/g, 'w')
    .replace(/(?<=[a-z])0|0(?=[a-z])/g, 'o')
    .replace(/(?<=[a-z])1|1(?=[a-z])/g, 'l')
    .replace(/(?<=[a-z])5(?=[a-z])/g, 's');
}

/** Query variants worth trying: "napa500" → also "napa"; "rnonas" → also "monas". */
export function queryVariants(query: string): string[] {
  const variants = new Set([query]);
  const alpha = query.replace(/\s*\d.*$/, '').trim();
  if (alpha.length >= 3) variants.add(alpha);
  for (const v of [...variants]) variants.add(foldOcrConfusions(v));
  return [...variants];
}

/** Ranks with every query variant and keeps each key's best score. */
export function rankKeysWithVariants(query: string, keys: readonly string[], limit = 10): RankedKey[] {
  const best = new Map<string, number>();
  for (const v of queryVariants(query)) {
    for (const r of rankKeys(v, keys, limit)) best.set(r.key, Math.min(best.get(r.key) ?? Infinity, r.score));
  }
  return [...best.entries()]
    .map(([key, score]) => ({ key, score }))
    .sort((a, b) => a.score - b.score || a.key.length - b.key.length || a.key.localeCompare(b.key))
    .slice(0, limit);
}
