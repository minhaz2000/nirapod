import { NextResponse, type NextRequest } from 'next/server';
import { getMedicineDb } from '@/lib/medicine/db';
import { getDataInfo, searchBrands } from '@/lib/medicine/repo';
import { redact } from '@/lib/privacy/redact';

/** GET /api/medicines/search?q=napa — fuzzy brand search (typos and OCR misreads tolerated). */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('q') ?? '';
  // Rule 9: redact again on the server in case a client sent identifiers. Nothing is stored.
  const q = redact(raw).replace(/\[[A-Z]+\]/g, ' ').trim().slice(0, 60);
  if (q.length < 2) return NextResponse.json({ error: 'query_too_short' }, { status: 400 });

  const db = getMedicineDb();
  if (!db) return NextResponse.json({ error: 'data_not_built' }, { status: 503 });

  return NextResponse.json(
    { query: q, results: searchBrands(db, q), data: getDataInfo(db) },
    { headers: { 'Cache-Control': 'public, max-age=3600' } },
  );
}
