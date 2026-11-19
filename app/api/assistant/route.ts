import { NextResponse, type NextRequest } from 'next/server';
import { answerQuestion } from '@/lib/assistant/agent';
import type { AssistantContext, AssistantRequest, ChatTurn } from '@/lib/assistant/types';
import { llmAvailable, llmProvider } from '@/lib/server/llm';

/**
 * POST /api/assistant — one chat turn. Body: { locale, messages: [{ role, text }], context? } where context holds
 * results already verified on the phone or by our routes (pack identified against the database, prescription lines
 * the user confirmed, report values). Text is redacted on the server too (rule 9). Nothing is stored.
 * GET → { available, provider } (provider name only).
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function parse(body: unknown): AssistantRequest | null {
  const b = body as Record<string, unknown> | null;
  if (!b || (b.locale !== 'bn' && b.locale !== 'en') || !Array.isArray(b.messages) || !b.messages.length || b.messages.length > 40) return null;
  const messages: ChatTurn[] = [];
  for (const m of b.messages as Array<Record<string, unknown>>) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.text !== 'string') return null;
    messages.push({ role: m.role, text: m.text.slice(0, 2000) });
  }
  const context = (typeof b.context === 'object' && b.context !== null ? b.context : undefined) as AssistantContext | undefined;
  return { locale: b.locale, messages, context };
}

export async function GET() {
  return NextResponse.json({ available: llmAvailable(), provider: llmProvider() }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  const request = parse(body);
  if (!request) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  const res = await answerQuestion(request);
  return NextResponse.json(res, { headers: { 'Cache-Control': 'no-store' } });
}
