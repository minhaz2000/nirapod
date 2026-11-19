import { NextResponse, type NextRequest } from 'next/server';
import { getMedicineDb } from '@/lib/medicine/db';
import { identifyPack, type PackEvidence } from '@/lib/medicine/identify';
import { getDataInfo, productsByBrandKey } from '@/lib/medicine/repo';
import { redact } from '@/lib/privacy/redact';

/**
 * POST /api/medicines/identify { evidence } — which medicine is in a pack photo, verified against the medicine
 * database (brand, then generic / strength / form / manufacturer cross-checks). Returns the verdict (strong, weak,
 * none), up to 3 candidates and the matching log. Nothing is stored.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const str = (v: unknown, max: number) => (typeof v === 'string' ? redact(v).slice(0, max) : undefined);

function parseEvidence(body: unknown): PackEvidence | null {
  const e = (body as { evidence?: Record<string, unknown> })?.evidence;
  if (!e || (e.source !== 'vision' && e.source !== 'ocr') || !Array.isArray(e.brandTexts)) return null;
  const brandTexts = e.brandTexts.filter((b): b is string => typeof b === 'string').slice(0, 12).map((b) => redact(b).slice(0, 60));
  return {
    source: e.source,
    brandTexts,
    generic: str(e.generic, 120),
    strength: str(e.strength, 60),
    form: str(e.form, 60),
    manufacturer: str(e.manufacturer, 120),
    text: str(e.text, 6000) ?? '',
  };
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  const evidence = parseEvidence(body);
  if (!evidence) return NextResponse.json({ error: 'invalid_evidence' }, { status: 400 });
  const db = getMedicineDb();
  if (!db) return NextResponse.json({ error: 'data_not_built' }, { status: 503 });
  const result = identifyPack(db, evidence, (key) => productsByBrandKey(db, key));
  return NextResponse.json({ ...result, data: getDataInfo(db) }, { headers: { 'Cache-Control': 'no-store' } });
}
