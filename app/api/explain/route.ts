import { NextResponse, type NextRequest } from 'next/server';
import { parseExplainInput } from '@/lib/explain/input';
import { runExplain } from '@/lib/explain/run';

/**
 * POST /api/explain — plain-language explanation of ALREADY-CHECKED results (rule 8). See lib/explain/run.ts:
 * the template is always built; a configured language model only rephrases it and is validated, otherwise the
 * template is returned. Nothing is stored or logged.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  const input = parseExplainInput(body);
  if (!input) return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  const r = await runExplain(input);
  return NextResponse.json({ source: r.source, text: r.text, lines: r.source === 'template' ? r.lines : undefined, reason: r.reason }, { headers: { 'Cache-Control': 'no-store' } });
}
