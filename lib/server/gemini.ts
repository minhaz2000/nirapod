/**
 * Google Gemini REST client (generativelanguage.googleapis.com, v1beta), server-only.
 *
 * - Auth: the API key goes in the `x-goog-api-key` header. Both key formats are supported: classic "AIza…" keys and
 *   the newer AI Studio "AQ." keys. If Google rejects an AQ. key in the header as the wrong token type
 *   (401 ACCESS_TOKEN_TYPE_UNSUPPORTED), the call is retried once with the key as the `key` query parameter.
 *   The key is never logged and never returned; any echo of it in an error message is removed.
 * - Model path: `models/{model}:generateContent`; a GEMINI_MODEL given as "models/xyz" works too.
 * - Every failure is classified (invalid key, invalid model, quota, permission, network, …) so it can be logged and
 *   shown instead of failing silently.
 */
import 'server-only';

export type LlmErrorKind =
  | 'missing_key'
  | 'missing_model'
  | 'invalid_key'
  | 'invalid_model'
  | 'quota'
  | 'permission'
  | 'network'
  | 'timeout'
  | 'refused'
  | 'incomplete'
  | 'bad_response'
  | 'unknown';

export interface GeminiConfig {
  apiKey: string;
  model: string;
}

/** Base URL; tests point it at a local mock server. */
export const geminiBase = () => (process.env.LLM_TEST_GEMINI_BASE_URL?.trim() || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');

/** "models/gemini-x" or " gemini-x " → "gemini-x". */
export const geminiModelId = (model: string) => model.trim().replace(/^models\//, '');

export function keyFormat(key: string): 'AIza' | 'AQ.' | 'other' {
  const k = key.trim();
  return k.startsWith('AIza') ? 'AIza' : k.startsWith('AQ.') ? 'AQ.' : 'other';
}

interface GoogleErrorBody {
  error?: { code?: number; status?: string; message?: string; details?: Array<{ reason?: string; '@type'?: string }> };
}

/** Maps a Gemini HTTP error to an error kind (pure; unit-tested with Google's real error shapes). */
export function classifyGeminiError(status: number, body: unknown): { kind: LlmErrorKind; message: string } {
  const e = (body as GoogleErrorBody | null)?.error ?? {};
  const message = String(e.message ?? `HTTP ${status}`);
  const reasons = (e.details ?? []).map((d) => d.reason ?? '').join(' ');
  const all = `${e.status ?? ''} ${reasons} ${message}`;
  if (/API_KEY_INVALID|API key not valid|API key expired|API_KEY_EXPIRED/i.test(all)) return { kind: 'invalid_key', message };
  if (status === 401 || /ACCESS_TOKEN_TYPE_UNSUPPORTED|UNAUTHENTICATED/i.test(all)) return { kind: 'invalid_key', message };
  if (status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(all)) return { kind: 'quota', message };
  if (status === 404 || /models\/\S+ is not found|is not supported for generateContent|model .*not found|unknown model/i.test(all)) {
    return { kind: 'invalid_model', message };
  }
  if (status === 403 || /PERMISSION_DENIED|SERVICE_DISABLED|API_KEY_SERVICE_BLOCKED|location is not supported|FAILED_PRECONDITION/i.test(all)) {
    return { kind: 'permission', message };
  }
  return { kind: status >= 500 ? 'network' : 'unknown', message };
}

const scrub = (text: string, key: string) => (key ? text.split(key).join('[key]') : text);

export type GeminiResult<T> =
  | { ok: true; json: T; auth: 'header' | 'query' }
  | { ok: false; kind: LlmErrorKind; status?: number; message: string; auth: 'header' | 'query' };

/** One REST call with classification, timeout and the AQ.-key retry. `path` is relative to the v1beta base. */
export async function geminiFetch<T>(
  cfg: GeminiConfig,
  path: string,
  init: { method?: 'GET' | 'POST'; body?: unknown; timeoutMs?: number } = {},
): Promise<GeminiResult<T>> {
  const key = cfg.apiKey.trim();
  const attempt = async (auth: 'header' | 'query'): Promise<GeminiResult<T>> => {
    const url = `${geminiBase()}/${path}${auth === 'query' ? `${path.includes('?') ? '&' : '?'}key=${encodeURIComponent(key)}` : ''}`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
        headers: { 'Content-Type': 'application/json', ...(auth === 'header' ? { 'x-goog-api-key': key } : {}) },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: AbortSignal.timeout(init.timeoutMs ?? 45_000),
        cache: 'no-store',
      });
    } catch (err) {
      const timeout = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
      return { ok: false, kind: timeout ? 'timeout' : 'network', message: scrub(err instanceof Error ? err.message : String(err), key), auth };
    }
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    if (!res.ok) {
      const c = classifyGeminiError(res.status, json);
      return { ok: false, kind: c.kind, status: res.status, message: scrub(c.message, key), auth };
    }
    if (json === null) return { ok: false, kind: 'bad_response', status: res.status, message: 'Response was not JSON', auth };
    return { ok: true, json: json as T, auth };
  };
  const first = await attempt('header');
  if (!first.ok && first.status === 401 && keyFormat(key) === 'AQ.') {
    const second = await attempt('query');
    return second.ok ? second : first;
  }
  return first;
}

export interface GeminiPart {
  text?: string;
  thought?: boolean;
  inlineData?: { mimeType: string; data: string };
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}
export interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}
export interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: GeminiPart[] };
    finishReason?: string;
    groundingMetadata?: { groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>; webSearchQueries?: string[] };
  }>;
  promptFeedback?: { blockReason?: string };
}

/** generateContent with a classified result for blocked / truncated answers too. */
export async function generateContent(cfg: GeminiConfig, body: Record<string, unknown>, timeoutMs?: number): Promise<GeminiResult<GeminiResponse>> {
  const r = await geminiFetch<GeminiResponse>(cfg, `models/${encodeURIComponent(geminiModelId(cfg.model))}:generateContent`, { body, timeoutMs });
  if (!r.ok) return r;
  if (r.json.promptFeedback?.blockReason) return { ok: false, kind: 'refused', message: `Blocked: ${r.json.promptFeedback.blockReason}`, auth: r.auth };
  const cand = r.json.candidates?.[0];
  if (!cand) return { ok: false, kind: 'bad_response', message: 'No candidates', auth: r.auth };
  const reason = cand.finishReason;
  if (reason && reason !== 'STOP') {
    const kind = /SAFETY|BLOCK|PROHIBITED|RECITATION|SPII/.test(reason) ? 'refused' : 'incomplete';
    return { ok: false, kind, message: `Finish reason ${reason}`, auth: r.auth };
  }
  return r;
}

/** Visible text of a response (thought parts excluded). */
export const responseText = (r: GeminiResponse) =>
  (r.candidates?.[0]?.content?.parts ?? [])
    .filter((p) => !p.thought && typeof p.text === 'string')
    .map((p) => p.text)
    .join('')
    .trim();

export interface GeminiModelInfo {
  id: string;
  displayName: string;
  generateContent: boolean;
}

/** models.list, all pages (model IDs this key can use). */
export async function listGeminiModels(cfg: { apiKey: string }): Promise<{ ok: true; models: GeminiModelInfo[] } | { ok: false; kind: LlmErrorKind; message: string }> {
  const models: GeminiModelInfo[] = [];
  let pageToken = '';
  for (let page = 0; page < 10; page++) {
    const r = await geminiFetch<{ models?: Array<{ name?: string; displayName?: string; supportedGenerationMethods?: string[] }>; nextPageToken?: string }>(
      { apiKey: cfg.apiKey, model: '' },
      `models?pageSize=1000${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`,
      { timeoutMs: 15_000 },
    );
    if (!r.ok) return { ok: false, kind: r.kind, message: r.message };
    for (const m of r.json.models ?? []) {
      if (!m.name) continue;
      models.push({ id: geminiModelId(m.name), displayName: m.displayName ?? '', generateContent: (m.supportedGenerationMethods ?? []).includes('generateContent') });
    }
    if (!r.json.nextPageToken) break;
    pageToken = r.json.nextPageToken;
  }
  return { ok: true, models };
}
