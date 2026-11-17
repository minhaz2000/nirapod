/**
 * Printed maximum retail price, e.g.
 *   "MRP Tk. 8.00 per Tablet", "M.R.P: ৳ 120.00", "Retail Price Tk 80.00 per 10 Tablets",
 *   "MRP: Tk. 30.00/Strip", "Price 35.00 Taka", "সর্বোচ্চ খুচরা মূল্য: ৮.০০ টাকা প্রতি ট্যাবলেট".
 */
import { normaliseOcrText } from './text';

export type PricePer = 'unit' | 'strip' | 'pack' | 'bottle';

export interface PrintedPrice {
  /** Amount in Taka. */
  amount: number;
  per: PricePer | null;
  /** Number of units the amount covers, when printed ("per 10 tablets", "strip of 10"). */
  count: number | null;
}

const LABEL = String.raw`(?:m\s*\.?\s*r\s*\.?\s*p\b\.?|max(?:imum)?\.?\s*retail\s*price|retail\s*price|\bprice|সর্বোচ্চ\s*খুচরা\s*মূল্য|খুচরা\s*মূল্য|মূল্য)`;
const CURRENCY = String.raw`(?:tk\.?|taka|bdt|৳|টাকা)`;
const AMOUNT = String.raw`(?<amount>\d{1,5}(?:[.,]\d{1,2})?)`;
const PRICE = new RegExp(
  `${LABEL}[\\s.:\\-]*(?:${CURRENCY}[\\s.]*)?${AMOUNT}(?:\\s*${CURRENCY})?(?<rest>[^\\n]{0,40})`,
  'i',
);

const UNIT_WORDS = String.raw`(?:tablets?|tabs?|capsules?|caps?|pieces?|pcs|units?|sachets?|ampoules?|amps?|vials?|ট্যাবলেট|ক্যাপসুল|পিস)`;

function perFrom(rest: string): Pick<PrintedPrice, 'per' | 'count'> {
  const r = rest.toLowerCase();
  let m = r.match(new RegExp(String.raw`(?:per|/|for|প্রতি)\s*(?:strip|পাতা)\s*(?:of\s*)?(\d+)?`));
  if (m) return { per: 'strip', count: m[1] ? Number(m[1]) : null };
  m = r.match(new RegExp(String.raw`(?:per|/|for|প্রতি)\s*(\d+)\s*${UNIT_WORDS}`));
  if (m) return { per: 'pack', count: Number(m[1]) };
  if (new RegExp(String.raw`(?:per|/|প্রতি)\s*${UNIT_WORDS}`).test(r)) return { per: 'unit', count: 1 };
  if (/(?:per|\/|প্রতি)\s*(?:bottle|bot|phial|বোতল)/.test(r)) return { per: 'bottle', count: null };
  if (/(?:per|\/|প্রতি)\s*(?:box|pack|carton|বক্স)/.test(r)) return { per: 'pack', count: null };
  return { per: null, count: null };
}

export function parsePrice(raw: string): PrintedPrice | null {
  const text = normaliseOcrText(raw);
  for (const line of text.split('\n')) {
    const m = line.match(PRICE);
    if (!m?.groups?.amount) continue;
    const amount = Number(m.groups.amount.replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) continue;
    return { amount, ...perFrom(m.groups.rest ?? '') };
  }
  return null;
}

/** Price per tablet/capsule/piece, when the printed text says what the amount covers. */
export function printedUnitPrice(p: PrintedPrice | null): number | null {
  if (!p) return null;
  if (p.per === 'unit') return p.amount;
  if (p.count && p.count > 0) return Math.round((p.amount / p.count) * 10_000) / 10_000;
  return null;
}
