import { NextResponse } from 'next/server';

/**
 * POST /api/explain — rephrases VERIFIED structured results (from the database and rules) in plain language via the Anthropic API.
 * Safety rule 8: the system prompt forbids adding medical facts; the output is checked and any medicine name, dose or number
 * not present in the input causes a fallback to the template explanation. Input must pass lib/privacy/redact.ts first.
 * Reads ANTHROPIC_API_KEY and ANTHROPIC_MODEL from the server environment only.
 * Placeholder — implementation pending.
 */
export const runtime = 'nodejs';

export async function POST() {
  return NextResponse.json({ error: 'not_implemented' }, { status: 501 });
}
