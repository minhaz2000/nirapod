import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { classifyGeminiError, geminiFetch, generateContent, geminiModelId, keyFormat, listGeminiModels } from '@/lib/server/gemini';
import { suggestGeminiModels } from '@/lib/server/llm-health';

const googleError = (code: number, status: string, message: string, reason?: string) => ({
  error: { code, status, message, details: reason ? [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason }] : [] },
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('error classification (Google error shapes)', () => {
  it.each([
    [400, googleError(400, 'INVALID_ARGUMENT', 'API key not valid. Please pass a valid API key.', 'API_KEY_INVALID'), 'invalid_key'],
    [401, googleError(401, 'UNAUTHENTICATED', 'Request had invalid authentication credentials.', 'ACCESS_TOKEN_TYPE_UNSUPPORTED'), 'invalid_key'],
    [404, googleError(404, 'NOT_FOUND', 'models/gemini-4-hydrogen is not found for API version v1beta, or is not supported for generateContent.'), 'invalid_model'],
    [400, googleError(400, 'INVALID_ARGUMENT', 'models/foo is not found for API version v1beta'), 'invalid_model'],
    [429, googleError(429, 'RESOURCE_EXHAUSTED', 'You exceeded your current quota.'), 'quota'],
    [403, googleError(403, 'PERMISSION_DENIED', 'Generative Language API has not been used in project 123 before or it is disabled.', 'SERVICE_DISABLED'), 'permission'],
    [400, googleError(400, 'FAILED_PRECONDITION', 'User location is not supported for the API use.'), 'permission'],
    [503, googleError(503, 'UNAVAILABLE', 'The model is overloaded.'), 'network'],
    [400, null, 'unknown'],
  ])('HTTP %i → %s', (status, body, kind) => {
    expect(classifyGeminiError(status as number, body).kind).toBe(kind);
  });
});

describe('key and model formats', () => {
  it('recognises AIza and AQ. keys', () => {
    expect(keyFormat('AIzaSyExample')).toBe('AIza');
    expect(keyFormat(' AQ.Ab8RN6Example ')).toBe('AQ.');
    expect(keyFormat('sk-other')).toBe('other');
  });
  it('accepts a model with or without the models/ prefix', () => {
    expect(geminiModelId('models/gemini-x-flash')).toBe('gemini-x-flash');
    expect(geminiModelId(' gemini-x-flash ')).toBe('gemini-x-flash');
  });
  it('suggests stable flash / pro text models, newest first', () => {
    const ids = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-2.5-flash-lite', 'gemini-embedding-001', 'gemini-2.5-flash-preview-tts', 'gemini-3-flash-preview', 'text-embedding-004'];
    const s = suggestGeminiModels(ids);
    expect(s[0]).toBe('gemini-3-flash-preview');
    expect(s).toContain('gemini-2.5-flash');
    expect(s).not.toContain('gemini-embedding-001');
    expect(s).not.toContain('gemini-2.5-flash-preview-tts');
    expect(s.indexOf('gemini-2.5-flash')).toBeLessThan(s.indexOf('gemini-2.5-flash-lite'));
  });
});

describe('requests', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('generateContent: v1beta endpoint, key in x-goog-api-key, never in the URL; camelCase image parts pass through', async () => {
    const f = vi.fn(async () => json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'OK' }] } }] }));
    vi.stubGlobal('fetch', f);
    const r = await generateContent({ apiKey: 'AIzaKEY', model: 'models/gemini-x-flash' }, { contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'image/jpeg', data: 'AAAA' } }, { text: 'hi' }] }] });
    expect(r.ok).toBe(true);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-x-flash:generateContent');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('AIzaKEY');
    expect(JSON.parse(init.body as string).contents[0].parts[0]).toEqual({ inlineData: { mimeType: 'image/jpeg', data: 'AAAA' } });
  });

  it('an AQ. key rejected in the header is retried once as ?key=', async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(json(googleError(401, 'UNAUTHENTICATED', 'bad', 'ACCESS_TOKEN_TYPE_UNSUPPORTED'), 401))
      .mockResolvedValueOnce(json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'OK' }] } }] }));
    vi.stubGlobal('fetch', f);
    const r = await generateContent({ apiKey: 'AQ.Ab8KEY', model: 'gemini-x' }, { contents: [] });
    expect(r).toMatchObject({ ok: true, auth: 'query' });
    expect((f.mock.calls[1] as unknown as [string])[0]).toContain('?key=AQ.Ab8KEY');
  });

  it('an AIza key is not retried; errors never contain the key', async () => {
    const f = vi.fn(async () => json(googleError(400, 'INVALID_ARGUMENT', 'API key not valid: AIzaSECRET', 'API_KEY_INVALID'), 400));
    vi.stubGlobal('fetch', f);
    const r = await geminiFetch({ apiKey: 'AIzaSECRET', model: 'm' }, 'models');
    expect(f).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ ok: false, kind: 'invalid_key' });
    expect(JSON.stringify(r)).not.toContain('AIzaSECRET');
  });

  it('network failure and timeout are reported as such', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    expect(await geminiFetch({ apiKey: 'k', model: 'm' }, 'models')).toMatchObject({ ok: false, kind: 'network' });
    vi.stubGlobal('fetch', vi.fn(async () => { throw Object.assign(new Error('timed out'), { name: 'TimeoutError' }); }));
    expect(await geminiFetch({ apiKey: 'k', model: 'm' }, 'models')).toMatchObject({ ok: false, kind: 'timeout' });
  });

  it('blocked and truncated answers are classified', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ promptFeedback: { blockReason: 'SAFETY' } })));
    expect(await generateContent({ apiKey: 'k', model: 'm' }, {})).toMatchObject({ ok: false, kind: 'refused' });
    vi.stubGlobal('fetch', vi.fn(async () => json({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [] } }] })));
    expect(await generateContent({ apiKey: 'k', model: 'm' }, {})).toMatchObject({ ok: false, kind: 'incomplete' });
  });

  it('models.list follows pages and keeps only the IDs', async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(json({ models: [{ name: 'models/gemini-a', supportedGenerationMethods: ['generateContent'] }], nextPageToken: 'p2' }))
      .mockResolvedValueOnce(json({ models: [{ name: 'models/embed-b', supportedGenerationMethods: ['embedContent'] }] }));
    vi.stubGlobal('fetch', f);
    const r = await listGeminiModels({ apiKey: 'k' });
    expect(r).toEqual({ ok: true, models: [{ id: 'gemini-a', displayName: '', generateContent: true }, { id: 'embed-b', displayName: '', generateContent: false }] });
    expect((f.mock.calls[1] as unknown as [string])[0]).toContain('pageToken=p2');
  });
});

describe('/api/llm/health', () => {
  const ENV = ['ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL', 'GEMINI_API_KEY', 'GEMINI_MODEL', 'LLM_PROVIDER', 'HEALTH_TOKEN'];
  const req = (q = '') => new Request(`http://localhost/api/llm/health${q}`) as unknown as import('next/server').NextRequest;
  const load = async () => {
    vi.resetModules();
    return (await import('@/app/api/llm/health/route')).GET;
  };
  beforeEach(() => ENV.forEach((k) => delete process.env[k]));
  afterEach(() => {
    ENV.forEach((k) => delete process.env[k]);
    vi.unstubAllGlobals();
  });

  it('missing key', async () => {
    process.env.LLM_PROVIDER = 'gemini';
    const body = await (await (await load())(req())).json();
    expect(body).toMatchObject({ provider: 'gemini', ok: false, error: 'missing_key' });
    expect(body.advice).toMatch(/GEMINI_API_KEY/);
  });

  it('invalid model name: lists the models this key can use and suggests valid ones; never returns the key', async () => {
    Object.assign(process.env, { LLM_PROVIDER: 'gemini', GEMINI_API_KEY: 'AQ.SECRETKEY', GEMINI_MODEL: 'gemini-4-hydrogen' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.includes(':generateContent')
          ? json(googleError(404, 'NOT_FOUND', 'models/gemini-4-hydrogen is not found for API version v1beta, or is not supported for generateContent.'), 404)
          : json({ models: [{ name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] }, { name: 'models/gemini-2.5-pro', supportedGenerationMethods: ['generateContent'] }] }),
      ),
    );
    const body = await (await (await load())(req())).json();
    expect(body).toMatchObject({ ok: false, error: 'invalid_model', model: 'gemini-4-hydrogen', keyFormat: 'AQ.', modelListed: false });
    expect(body.models).toEqual(['gemini-2.5-flash', 'gemini-2.5-pro']);
    expect(body.suggested[0]).toBe('gemini-2.5-flash');
    expect(JSON.stringify(body)).not.toContain('SECRETKEY');
  });

  it('ok with a working model; HEALTH_TOKEN protects the endpoint when set', async () => {
    Object.assign(process.env, { LLM_PROVIDER: 'gemini', GEMINI_API_KEY: 'AIzaKEY', GEMINI_MODEL: 'gemini-2.5-flash', HEALTH_TOKEN: 't0k' });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url.includes(':generateContent') ? json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'OK' }] } }] }) : json({ models: [{ name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] }] }))));
    const GET = await load();
    expect((await GET(req())).status).toBe(403);
    const body = await (await GET(req('?token=t0k'))).json();
    expect(body).toMatchObject({ ok: true, provider: 'gemini', modelListed: true, reply: 'OK', auth: 'header' });
  });
});
