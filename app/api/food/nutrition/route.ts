import { NextResponse } from 'next/server';

/**
 * GET /api/food/nutrition?food= — nutrition lookup from the FoodNetBD-derived SQLite table.
 * Placeholder — implementation pending.
 */
export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({ error: 'not_implemented' }, { status: 501 });
}
