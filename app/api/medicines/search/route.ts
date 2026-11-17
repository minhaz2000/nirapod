import { NextResponse } from 'next/server';

/**
 * GET /api/medicines/search?q= — brand/generic search in data/build medicine SQLite (better-sqlite3).
 * Placeholder — implementation pending.
 */
export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({ error: 'not_implemented' }, { status: 501 });
}
