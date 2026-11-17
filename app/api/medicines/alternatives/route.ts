import { NextResponse, type NextRequest } from 'next/server';
import { getMedicineDb } from '@/lib/medicine/db';
import { findAlternatives, getDataInfo } from '@/lib/medicine/repo';

/**
 * GET /api/medicines/alternatives?id=14521 — other brands with the same generic AND strength AND dosage form,
 * sorted by unit price. Safety rule 10: the UI always shows "Confirm with your pharmacist".
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get('id'));
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });

  const db = getMedicineDb();
  if (!db) return NextResponse.json({ error: 'data_not_built' }, { status: 503 });

  const result = findAlternatives(db, id);
  if (result.status === 'not_found') return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ ...result, data: getDataInfo(db) }, { headers: { 'Cache-Control': 'public, max-age=3600' } });
}
