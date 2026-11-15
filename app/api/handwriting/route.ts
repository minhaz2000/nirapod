import { NextResponse } from 'next/server';

/**
 * POST /api/handwriting — reads a handwritten prescription via the Anthropic API (server-only key and model from env).
 * Safety rule 7: results are returned for the user to confirm or edit before use. Redact before sending.
 * Placeholder — implementation pending.
 */
export const runtime = 'nodejs';

export async function POST() {
  return NextResponse.json({ error: 'not_implemented' }, { status: 501 });
}
