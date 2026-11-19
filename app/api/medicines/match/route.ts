import { NextResponse, type NextRequest } from 'next/server';
import { getMedicineDb } from '@/lib/medicine/db';
import { nameIndex } from '@/lib/medicine/repo';
import { closestName } from '@/lib/medicine/suggest';
import { redact } from '@/lib/privacy/redact';

/**
 * POST /api/medicines/match { names: string[] } — closest medicine name for each name read by on-device OCR
 * ("Metfrmin" → Metformin), or null when nothing is close. Works without any AI key. The client sends only the
 * name part of each medicine line (header cropped, redacted); nothing is stored. Results are suggestions the user
 * must confirm (rule 7).
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_NAMES = 25;

export async function POST(req: NextRequest) {
  let body: { names?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  if (!Array.isArray(body.names) || body.names.length > MAX_NAMES || !body.names.every((n) => typeof n === 'string')) {
    return NextResponse.json({ error: 'invalid_names' }, { status: 400 });
  }
  const db = getMedicineDb();
  if (!db) return NextResponse.json({ error: 'data_not_built' }, { status: 503 });
  const index = nameIndex(db);
  const matches = (body.names as string[]).map((raw) => {
    const name = redact(raw).replace(/\[[A-Z]+\]/g, ' ').trim().slice(0, 40);
    const m = closestName(name, index);
    return m ? { name: m.name, kind: m.kind, generic: m.generic, exact: m.score === 0 } : null;
  });
  return NextResponse.json({ matches }, { headers: { 'Cache-Control': 'no-store' } });
}
