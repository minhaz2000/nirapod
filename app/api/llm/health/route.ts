import { NextResponse, type NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { geminiFetch, geminiModelId, keyFormat, listGeminiModels, responseText, type GeminiResponse } from '@/lib/server/gemini';
import { HEALTH_ADVICE, suggestGeminiModels, type HealthError } from '@/lib/server/llm-health';
import { classifyAnthropicError } from '@/lib/server/llm';

/**
 * GET /api/llm/health — is the configured AI provider working?
 * Makes ONE tiny real call ("Reply with OK") and lists the model IDs this key can use (Gemini models.list).
 * Returns ok, or the exact error type (missing_key, invalid_key, invalid_model, quota, permission, network, …) with
 * advice. Never returns the key. Results are cached for 30 s so the endpoint cannot be used to burn quota.
 * If HEALTH_TOKEN is set, the request must carry ?token=<HEALTH_TOKEN>.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CACHE_MS = 30_000;
let cached: { at: number; body: Record<string, unknown> } | null = null;

const env = (k: string) => process.env[k]?.trim() || '';

async function checkGemini(): Promise<Record<string, unknown>> {
  const apiKey = env('GEMINI_API_KEY');
  const model = geminiModelId(env('GEMINI_MODEL'));
  const base = { provider: 'gemini', model: model || null, keyFormat: apiKey ? keyFormat(apiKey) : null };
  if (!apiKey) return { ...base, ok: false, error: 'missing_key' satisfies HealthError };

  const listed = await listGeminiModels({ apiKey });
  const models = listed.ok ? listed.models.filter((m) => m.generateContent).map((m) => m.id) : [];
  const listInfo = listed.ok ? { models, suggested: suggestGeminiModels(models) } : { models: [], modelsError: listed.kind, modelsMessage: listed.message };
  if (!model) return { ...base, ok: false, error: 'missing_model' satisfies HealthError, ...listInfo };

  const r = await geminiFetch<GeminiResponse>(
    { apiKey, model },
    `models/${encodeURIComponent(model)}:generateContent`,
    { body: { contents: [{ role: 'user', parts: [{ text: 'Reply with the single word OK.' }] }], generationConfig: { maxOutputTokens: 512 } }, timeoutMs: 30_000 },
  );
  const modelListed = listed.ok ? models.includes(model) : null;
  if (!r.ok) {
    // A model missing from the list explains a 400 that Google words differently.
    const error: HealthError = r.kind === 'unknown' && modelListed === false ? 'invalid_model' : r.kind;
    console.error(`[llm] health check via gemini failed: ${error} — HTTP ${r.status ?? '-'} ${r.message.slice(0, 300)}`);
    return { ...base, ok: false, error, status: r.status ?? null, message: r.message, auth: r.auth, modelListed, ...listInfo };
  }
  return { ...base, ok: true, auth: r.auth, reply: responseText(r.json).slice(0, 40), finishReason: r.json.candidates?.[0]?.finishReason ?? null, modelListed, ...listInfo };
}

async function checkAnthropic(): Promise<Record<string, unknown>> {
  const apiKey = env('ANTHROPIC_API_KEY');
  const model = env('ANTHROPIC_MODEL');
  const base = { provider: 'anthropic', model: model || null };
  if (!apiKey) return { ...base, ok: false, error: 'missing_key' satisfies HealthError };
  const client = new Anthropic({ apiKey, timeout: 30_000, maxRetries: 0 });
  let models: string[] = [];
  try {
    for await (const m of client.models.list({ limit: 100 })) models.push(m.id);
  } catch {
    models = [];
  }
  if (!model) return { ...base, ok: false, error: 'missing_model' satisfies HealthError, models };
  try {
    await client.messages.create({ model, max_tokens: 8, messages: [{ role: 'user', content: 'Reply with the single word OK.' }] });
    return { ...base, ok: true, models, modelListed: models.length ? models.includes(model) : null };
  } catch (err) {
    const error = classifyAnthropicError(err) as HealthError;
    const message = (err instanceof Error ? err.message : String(err)).split(apiKey).join('[key]');
    console.error(`[llm] health check via anthropic failed: ${error} — ${message.slice(0, 300)}`);
    return { ...base, ok: false, error, message, models };
  }
}

export async function GET(req: NextRequest) {
  const token = env('HEALTH_TOKEN');
  if (token && new URL(req.url).searchParams.get('token') !== token) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (cached && Date.now() - cached.at < CACHE_MS) {
    return NextResponse.json({ ...cached.body, cached: true }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const wanted = env('LLM_PROVIDER').toLowerCase();
  const hasGemini = Boolean(env('GEMINI_API_KEY'));
  const hasAnthropic = Boolean(env('ANTHROPIC_API_KEY'));
  const provider = wanted === 'gemini' || wanted === 'anthropic' ? wanted : hasGemini && !hasAnthropic ? 'gemini' : 'anthropic';

  const result = provider === 'gemini' ? await checkGemini() : await checkAnthropic();
  const error = result.error as HealthError | undefined;
  const body = {
    ...result,
    llmProvider: wanted || null,
    configured: { GEMINI_API_KEY: hasGemini, GEMINI_MODEL: Boolean(env('GEMINI_MODEL')), ANTHROPIC_API_KEY: hasAnthropic, ANTHROPIC_MODEL: Boolean(env('ANTHROPIC_MODEL')) },
    ...(error ? { advice: HEALTH_ADVICE[error] } : {}),
    checkedAt: new Date().toISOString(),
  };
  cached = { at: Date.now(), body };
  return NextResponse.json(body, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}
