import { NextResponse, type NextRequest } from 'next/server';
import { getMedicineDb } from '@/lib/medicine/db';
import { nameIndex } from '@/lib/medicine/repo';
import { suggestNames } from '@/lib/medicine/suggest';
import { redact } from '@/lib/privacy/redact';

/**
 * GET /api/medicines/suggest?q=met — medicine-name autocomplete (brand and generic; Latin or Bangla script)
 * from the local medicine database. Works without any AI key. Suggestions only: the user picks and confirms.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // Rule 9: redact again on the server. Nothing is stored.
  const q = redact(req.nextUrl.searchParams.get('q') ?? '').replace(/\[[A-Z]+\]/g, ' ').trim().slice(0, 40);
  if (q.replace(/\s/g, '').length < 2) return NextResponse.json({ error: 'query_too_short' }, { status: 400 });
  const db = getMedicineDb();
  if (!db) return NextResponse.json({ error: 'data_not_built' }, { status: 503 });
  const suggestions = suggestNames(q, nameIndex(db), 8).map(({ name, kind, generic }) => ({ name, kind, generic }));
  return NextResponse.json({ query: q, suggestions }, { headers: { 'Cache-Control': 'public, max-age=3600' } });
}
