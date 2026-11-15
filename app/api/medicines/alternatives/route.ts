import { NextResponse } from 'next/server';

/**
 * GET /api/medicines/alternatives — cheaper brands with EXACTLY the same generic, strength and dosage form.
 * Safety rule 10: the UI always shows 'Confirm with your pharmacist'.
 * Placeholder — implementation pending.
 */
export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({ error: 'not_implemented' }, { status: 501 });
}
