/**
 * Normalisation shared by scripts/build-data.ts (build time) and the API routes (query time),
 * so that both sides compare the same keys. Formatting only — never changes meaning
 * (e.g. 500 mg stays 500 mg; it is not converted to 0.5 g).
 */

/** Trims, collapses whitespace, and treats the dataset's literal "NULL" as empty. */
export function cleanText(value: string | null | undefined): string {
  const s = (value ?? '').replace(/\s+/g, ' ').trim();
  return /^null$/i.test(s) ? '' : s;
}

/** Search key for brand / generic / manufacturer names: lower case, letters and digits only. */
export function nameKey(value: string | null | undefined): string {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** "125 mg/5 ml" → "125mg/5ml"; "1 gm" → "1g"; "5.0mg" → "5mg"; "NULL" → "". */
export function strengthKey(value: string | null | undefined): string {
  return cleanText(value)
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[µμ]g/g, 'mcg')
    .replace(/gm(?![a-z])/g, 'g')
    .replace(/(\d+)\.0+(?!\d)/g, '$1');
}

const FORM_ALIASES: Record<string, string> = {
  'e/e drops': 'eye/ear drops',
  'eye & ear drops': 'eye/ear drops',
};

/** Dosage form key: lower case; a few spelling variants of the same form are unified. */
export function formKey(value: string | null | undefined): string {
  const k = cleanText(value).toLowerCase();
  return FORM_ALIASES[k] ?? k;
}

export type PackUnit = 'piece' | 'ml' | 'g' | 'dose';

export interface Pack {
  /** Pack price in Taka. */
  price: number;
  /** Pack size as written in the dataset, e.g. "10x10's pack", "60ml bot". */
  label: string;
  quantity: number | null;
  unit: PackUnit | null;
  /** price / quantity, rounded to 4 decimals; null when the quantity is unknown. */
  unitPrice: number | null;
}

/** Reads the quantity and unit out of a pack-size label. */
export function parsePackQuantity(label: string): { quantity: number; unit: PackUnit } | null {
  const s = cleanText(label).toLowerCase().replace(/["’`]/g, "'");
  if (!s) return null;
  let m = s.match(/(\d+)\s*x\s*(\d+)\s*'\s*s/); // 10x10's pack
  if (m) return { quantity: Number(m[1]) * Number(m[2]), unit: 'piece' };
  m = s.match(/(\d+)\s*'\s*s?(?:\b|\s|$)/); // 30's pack, 1's, 20'pack
  if (m) return { quantity: Number(m[1]), unit: 'piece' };
  m = s.match(/(\d+)\s*(?:amps?|ampoules?|vials?|sachets?|pcs|pieces?|strips?|caps?|capsules?|tabs?|tablets?|tubes?|s)\b/);
  if (m) return { quantity: Number(m[1]), unit: 'piece' };
  m = s.match(/(\d+)\s*(?:doses?|puffs?|m[e]?tered|sprays?|inhalations?|actuations?)/);
  if (m) return { quantity: Number(m[1]), unit: 'dose' };
  m = s.match(/(\d+(?:\.\d+)?)\s*ml/);
  if (m) return { quantity: Number(m[1]), unit: 'ml' };
  m = s.match(/(\d+(?:\.\d+)?)\s*g(?:m|ram)?s?\b/);
  if (m) return { quantity: Number(m[1]), unit: 'g' };
  if (/\b(?:vial|ampoule|amp|tube|prefilled syringe)\b/.test(s)) return { quantity: 1, unit: 'piece' };
  return null;
}

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

/**
 * Pairs the dataset's price and pack-size columns, which may hold several options separated by "/":
 *   price "18.23 / 20.63", packsize "50ml bot/ 60ml bot" → two packs.
 */
export function parsePacks(priceField: string, packField: string): Pack[] {
  const prices = cleanText(priceField)
    .split('/')
    .map((p) => Number(p.replace(/[^\d.]/g, '')))
    .filter((p) => Number.isFinite(p) && p > 0);
  if (prices.length === 0) return [];
  let labels = cleanText(packField).split('/').map(cleanText);
  if (labels.length !== prices.length) {
    const byX = cleanText(packField).split(/\s+x\s+/i).map(cleanText); // "100ml bot x 200 ml bot"
    if (byX.length === prices.length) labels = byX;
  }
  return prices.map((price, i) => {
    // Only pair a label with a price when the counts line up; otherwise the quantity is unknown.
    const label = labels.length === prices.length ? (labels[i] ?? '') : prices.length === 1 ? cleanText(packField) : '';
    const q = parsePackQuantity(label);
    return {
      price,
      label,
      quantity: q?.quantity ?? null,
      unit: q?.unit ?? null,
      unitPrice: q && q.quantity > 0 ? round4(price / q.quantity) : null,
    };
  });
}

/** The lowest unit price among packs that share the first priced pack's unit. */
export function bestUnitPrice(packs: readonly Pack[]): { unitPrice: number; unit: PackUnit } | null {
  const first = packs.find((p) => p.unitPrice !== null && p.unit !== null);
  if (!first?.unit) return null;
  const same = packs.filter((p) => p.unit === first.unit && p.unitPrice !== null).map((p) => p.unitPrice!);
  return { unitPrice: Math.min(...same), unit: first.unit };
}
