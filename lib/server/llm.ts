/**
 * Server-only access to a language model for /api/handwriting and /api/explain: Anthropic (SDK) or Google Gemini
 * (REST, generateContent). Keys and model names come from the environment (see llm-select.ts) and never reach the
 * client; the client only learns whether AI is available and which provider (by name) is used.
 * Callers redact before sending (rule 9); nothing is stored or logged here.
 */
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema';
import { selectLlm, type LlmChoice, type LlmProvider } from './llm-select';

export type { LlmProvider };

export const llmProvider = (): LlmProvider | null => selectLlm()?.provider ?? null;
export const llmAvailable = (): boolean => selectLlm() !== null;

export type LlmError = 'busy' | 'failed' | 'refused' | 'incomplete';
export type LlmResult<T> = { ok: true; value: T } | { ok: false; error: LlmError };

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
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

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

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
}

async function gemini(
  c: LlmChoice,
  body: { system: string; text: string; image?: LlmImage; maxTokens: number; schema?: JsonSchema },
): Promise<LlmResult<string>> {
  const parts: unknown[] = [];
  if (body.image) parts.push({ inline_data: { mime_type: body.image.mediaType, data: body.image.base64 } });
  parts.push({ text: body.text });
  let res: Response;
  try {
    res = await fetch(`${GEMINI_URL}/${encodeURIComponent(c.model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': c.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: body.system }] },
        contents: [{ role: 'user', parts }],
        generationConfig: {
          maxOutputTokens: body.maxTokens,
          ...(body.schema ? { responseMimeType: 'application/json', responseSchema: toGeminiSchema(body.schema) } : {}),
        },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch {
    return { ok: false, error: 'failed' };
  }
  if (res.status === 429) return { ok: false, error: 'busy' };
  if (!res.ok) return { ok: false, error: 'failed' };
  let json: GeminiResponse;
  try {
    json = (await res.json()) as GeminiResponse;
  } catch {
    return { ok: false, error: 'failed' };
  }
  if (json.promptFeedback?.blockReason) return { ok: false, error: 'refused' };
  const cand = json.candidates?.[0];
  if (!cand) return { ok: false, error: 'failed' };
  if (cand.finishReason && cand.finishReason !== 'STOP') {
    return { ok: false, error: /SAFETY|BLOCK|PROHIBITED|RECITATION|SPII/.test(cand.finishReason) ? 'refused' : 'incomplete' };
  }
  const text = (cand.content?.parts ?? [])
    .filter((p) => !p.thought && typeof p.text === 'string')
    .map((p) => p.text)
    .join('')
    .trim();
  return text ? { ok: true, value: text } : { ok: false, error: 'failed' };
}

const anthropicClient = (c: LlmChoice) => new Anthropic({ apiKey: c.apiKey, timeout: TIMEOUT_MS, maxRetries: 1 });
const anthropicError = (err: unknown): LlmResult<never> => ({ ok: false, error: err instanceof Anthropic.RateLimitError ? 'busy' : 'failed' });

/** Structured output (JSON matching `schema`), optionally with one image. */
export async function llmJson<T>(req: { system: string; text: string; image?: LlmImage; schema: JsonSchema; maxTokens: number }): Promise<LlmResult<T>> {
  const c = selectLlm();
  if (!c) return { ok: false, error: 'failed' };
  if (c.provider === 'gemini') {
    // Thinking models count reasoning in the output budget: allow room for it.
    const r = await gemini(c, { ...req, maxTokens: Math.max(req.maxTokens, 8192) });
    if (!r.ok) return r;
    try {
      return { ok: true, value: JSON.parse(r.value) as T };
    } catch {
      return { ok: false, error: 'failed' };
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
    if (response.stop_reason === 'refusal') return { ok: false, error: 'refused' };
    if (!response.parsed_output) return { ok: false, error: 'failed' };
    return { ok: true, value: response.parsed_output as T };
  } catch (err) {
    return anthropicError(err);
  }
}

/** Plain text. `incomplete` when the model stopped early (the caller then uses its template). */
export async function llmText(req: { system: string; text: string; maxTokens: number }): Promise<LlmResult<string>> {
  const c = selectLlm();
  if (!c) return { ok: false, error: 'failed' };
  if (c.provider === 'gemini') return gemini(c, { ...req, maxTokens: Math.max(req.maxTokens, 8192) });
  try {
    const response = await anthropicClient(c).messages.create({
      model: c.model,
      max_tokens: req.maxTokens,
      system: req.system,
      messages: [{ role: 'user', content: req.text }],
    });
    if (response.stop_reason !== 'end_turn') return { ok: false, error: 'incomplete' };
    const text = response.content
      .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    return { ok: true, value: text };
  } catch (err) {
    return anthropicError(err);
  }
}
