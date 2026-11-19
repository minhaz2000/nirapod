/**
 * Server-only access to a language model for /api/handwriting and /api/explain: Anthropic (SDK) or Google Gemini
 * (REST, generateContent). Keys and model names come from the environment (see llm-select.ts) and never reach the
 * client; the client only learns whether AI is available and which provider (by name) is used.
 * Callers redact before sending (rule 9); nothing is stored. Failures are logged (kind and Google's / Anthropic's
 * error message only — never the key or the user's content) and returned to the caller, never swallowed.
 */
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema';
import { generateContent, responseText, type GeminiPart, type LlmErrorKind } from './gemini';
import { selectLlm, type LlmChoice, type LlmProvider } from './llm-select';

export type { LlmProvider };

export const llmProvider = (): LlmProvider | null => selectLlm()?.provider ?? null;
export const llmAvailable = (): boolean => selectLlm() !== null;

export type LlmError = LlmErrorKind;
export type LlmResult<T> = { ok: true; value: T } | { ok: false; error: LlmError; message?: string };

export interface LlmImage {
  base64: string;
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
}

interface JsonSchema {
  type: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: readonly string[];
  additionalProperties?: boolean;
}

const TIMEOUT_MS = 45_000;

/** JSON Schema → Gemini responseSchema (OpenAPI subset: upper-case types, no additionalProperties). */
export function toGeminiSchema(s: JsonSchema): Record<string, unknown> {
  const out: Record<string, unknown> = { type: s.type.toUpperCase() };
  if (s.description) out.description = s.description;
  if (s.properties) {
    out.properties = Object.fromEntries(Object.entries(s.properties).map(([k, v]) => [k, toGeminiSchema(v)]));
    out.propertyOrdering = Object.keys(s.properties);
  }
  if (s.items) out.items = toGeminiSchema(s.items);
  if (s.required) out.required = [...s.required];
  return out;
}

/** Never silent: every AI failure is logged on the server with its kind (no key, no user content). */
export function logLlmFailure(op: string, provider: LlmProvider | null, error: LlmErrorKind, message?: string) {
  console.error(`[llm] ${op} via ${provider ?? 'none'} failed: ${error}${message ? ` — ${message.slice(0, 300)}` : ''}`);
}

async function gemini(
  c: LlmChoice,
  op: string,
  body: { system: string; text: string; image?: LlmImage; maxTokens: number; schema?: JsonSchema },
): Promise<LlmResult<string>> {
  const parts: GeminiPart[] = [];
  if (body.image) parts.push({ inlineData: { mimeType: body.image.mediaType, data: body.image.base64 } });
  parts.push({ text: body.text });
  const r = await generateContent(
    { apiKey: c.apiKey, model: c.model },
    {
      systemInstruction: { parts: [{ text: body.system }] },
      contents: [{ role: 'user', parts }],
      generationConfig: {
        maxOutputTokens: body.maxTokens,
        ...(body.schema ? { responseMimeType: 'application/json', responseSchema: toGeminiSchema(body.schema) } : {}),
      },
    },
    TIMEOUT_MS,
  );
  if (!r.ok) {
    logLlmFailure(op, 'gemini', r.kind, `${r.status ? `HTTP ${r.status} ` : ''}${r.message}`);
    return { ok: false, error: r.kind, message: r.message };
  }
  const text = responseText(r.json);
  if (!text) {
    logLlmFailure(op, 'gemini', 'bad_response', 'empty text');
    return { ok: false, error: 'bad_response' };
  }
  return { ok: true, value: text };
}

const anthropicClient = (c: LlmChoice) => new Anthropic({ apiKey: c.apiKey, timeout: TIMEOUT_MS, maxRetries: 1 });

/** Maps Anthropic SDK errors to the same kinds as Gemini. */
export function classifyAnthropicError(err: unknown): LlmErrorKind {
  const is = (name: keyof typeof Anthropic) => {
    const cls = (Anthropic as unknown as Record<string, unknown>)[name];
    return typeof cls === 'function' && err instanceof (cls as new (...a: never[]) => unknown);
  };
  if (is('RateLimitError')) return 'quota';
  if (is('AuthenticationError')) return 'invalid_key';
  if (is('PermissionDeniedError')) return 'permission';
  if (is('NotFoundError')) return 'invalid_model';
  if (is('APIConnectionTimeoutError')) return 'timeout';
  if (is('APIConnectionError')) return 'network';
  const status = (err as { status?: unknown } | null)?.status;
  if (typeof status === 'number' && status >= 500) return 'network';
  return 'unknown';
}
function anthropicFailure(op: string, err: unknown): LlmResult<never> {
  const error = classifyAnthropicError(err);
  logLlmFailure(op, 'anthropic', error, err instanceof Error ? err.message : undefined);
  return { ok: false, error };
}

function missing(op: string): LlmResult<never> {
  logLlmFailure(op, null, 'missing_key');
  return { ok: false, error: 'missing_key' };
}

/** Structured output (JSON matching `schema`), optionally with one image. */
export async function llmJson<T>(req: { system: string; text: string; image?: LlmImage; schema: JsonSchema; maxTokens: number; op?: string }): Promise<LlmResult<T>> {
  const op = req.op ?? 'json';
  const c = selectLlm();
  if (!c) return missing(op);
  if (c.provider === 'gemini') {
    // Thinking models count reasoning in the output budget: allow room for it.
    const r = await gemini(c, op, { ...req, maxTokens: Math.max(req.maxTokens, 8192) });
    if (!r.ok) return r;
    try {
      return { ok: true, value: JSON.parse(r.value) as T };
    } catch {
      logLlmFailure(op, 'gemini', 'bad_response', 'answer was not valid JSON');
      return { ok: false, error: 'bad_response' };
    }
  }
  try {
    const content: Anthropic.ContentBlockParam[] = [];
    if (req.image) content.push({ type: 'image', source: { type: 'base64', media_type: req.image.mediaType, data: req.image.base64 } });
    content.push({ type: 'text', text: req.text });
    const response = await anthropicClient(c).messages.parse({
      model: c.model,
      max_tokens: req.maxTokens,
      system: req.system,
      messages: [{ role: 'user', content }],
      output_config: { format: jsonSchemaOutputFormat(req.schema as Parameters<typeof jsonSchemaOutputFormat>[0]) },
    });
    if (response.stop_reason === 'refusal') {
      logLlmFailure(op, 'anthropic', 'refused');
      return { ok: false, error: 'refused' };
    }
    if (!response.parsed_output) {
      logLlmFailure(op, 'anthropic', 'bad_response', 'no parsed output');
      return { ok: false, error: 'bad_response' };
    }
    return { ok: true, value: response.parsed_output as T };
  } catch (err) {
    return anthropicFailure(op, err);
  }
}

/** Plain text. `incomplete` when the model stopped early (the caller then uses its template). */
export async function llmText(req: { system: string; text: string; maxTokens: number; op?: string }): Promise<LlmResult<string>> {
  const op = req.op ?? 'text';
  const c = selectLlm();
  if (!c) return missing(op);
  if (c.provider === 'gemini') return gemini(c, op, { ...req, maxTokens: Math.max(req.maxTokens, 8192) });
  try {
    const response = await anthropicClient(c).messages.create({
      model: c.model,
      max_tokens: req.maxTokens,
      system: req.system,
      messages: [{ role: 'user', content: req.text }],
    });
    if (response.stop_reason !== 'end_turn') {
      logLlmFailure(op, 'anthropic', 'incomplete', `stop_reason ${response.stop_reason}`);
      return { ok: false, error: 'incomplete' };
    }
    const text = response.content
      .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    return { ok: true, value: text };
  } catch (err) {
    return anthropicFailure(op, err);
  }
}
