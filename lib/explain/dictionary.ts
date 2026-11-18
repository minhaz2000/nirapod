/** Server-only: medicine names from the database, for the explanation validator. Built once per server instance. */
import 'server-only';
import type Database from 'better-sqlite3';
import { nameKey } from '@/lib/medicine/normalise';

/** Everyday words that happen to be brand names; they are not treated as medicine names in explanations. */
const COMMON_WORDS = new Set(
  `about above after again also always and another any are ask asked away back because been before being below best
   both but call calm can care check clear comfort common commonly could daily day does doctor done each ease easy every
   extra fast fine first for free fresh from gentle give good has have heal health healthy help her here high his how
   just keep kind life like long low may more most much must near need new next night normal not now off often once one
   only other our out over own part pain plus power pro rest result right safe same see she should simple some soon star
   still sugar sure take than that the their them then there these they this those through time today together total
   under until use used usual very vital well what when where which while who will with within without you your`.split(/\s+/),
);

let cache: Set<string> | null = null;

export function medicineDictionary(db: Database.Database): Set<string> {
  if (cache) return cache;
  const names = new Set<string>();
  const add = (raw: string | null) => {
    const k = nameKey(raw);
    if (k.length >= 4 && /[a-z]/.test(k) && !COMMON_WORDS.has(k) && k.split(' ').length <= 3) names.add(k);
  };
  for (const b of db.prepare('SELECT DISTINCT brand_key FROM products').pluck().all() as string[]) add(b);
  for (const g of db.prepare('SELECT name FROM generics').pluck().all() as string[]) {
    add(g);
    for (const part of g.split('+')) add(part);
  }
  cache = names;
  return names;
}
