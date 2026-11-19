import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const parse = vi.fn();
vi.mock('@anthropic-ai/sdk', async (orig) => {
  const actual = await orig<typeof import('@anthropic-ai/sdk')>();
  class FakeAnthropic {
    static RateLimitError = actual.default.RateLimitError;
    messages = { parse };
  }
  return { ...actual, default: FakeAnthropic };
});

const IMAGE = Buffer.from('fake image bytes').toString('base64');
const req = (body: unknown) =>
  new Request('http://localhost/api/handwriting', { method: 'POST', body: JSON.stringify(body) }) as unknown as import('next/server').NextRequest;

async function load() {
  vi.resetModules();
  return import('@/app/api/handwriting/route');
}

describe('/api/handwriting', () => {
  beforeEach(() => {
    parse.mockReset();
    for (const k of ['ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL', 'GEMINI_API_KEY', 'GEMINI_MODEL', 'LLM_PROVIDER']) delete process.env[k];
  });
  afterEach(() => {
    for (const k of ['ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL', 'GEMINI_API_KEY', 'GEMINI_MODEL', 'LLM_PROVIDER']) delete process.env[k];
    vi.unstubAllGlobals();
  });

  it('without an API key: "not available", and the SDK is never called', async () => {
    const { GET, POST } = await load();
    expect(await (await GET()).json()).toEqual({ available: false, provider: null });
    const res = await POST(req({ image: IMAGE, mediaType: 'image/jpeg' }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'not_available' });
    expect(parse).not.toHaveBeenCalled();
  });

  it('needs the model name from the environment too', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const { POST } = await load();
    expect((await POST(req({ image: IMAGE, mediaType: 'image/jpeg' }))).status).toBe(503);
  });

  describe('with a key', () => {
    beforeEach(() => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      process.env.ANTHROPIC_MODEL = 'model-from-env';
    });

    it('rejects bad input', async () => {
      const { POST } = await load();
      expect((await POST(req({ image: 'not base64!!', mediaType: 'image/jpeg' }))).status).toBe(400);
      expect((await POST(req({ image: IMAGE, mediaType: 'application/pdf' }))).status).toBe(400);
    });

    it('returns cleaned, redacted lines for the user to confirm; uses the model from the environment', async () => {
      parse.mockResolvedValue({
        stop_reason: 'end_turn',
        parsed_output: {
          items: [
            { medicine: 'Comet', strength: '500 mg', frequency: '1+0+1', duration: '30 days', diagnosis_if_written: 'Type 2 DM', confidence: 0.92 },
            { medicine: 'Napa', strength: '500mg', frequency: 'SOS', duration: '', diagnosis_if_written: '', confidence: 1.7 },
            { medicine: 'call 01712345678', strength: '', frequency: '', duration: '', diagnosis_if_written: '', confidence: -2 },
            { medicine: '', strength: '', frequency: '', duration: '', diagnosis_if_written: '', confidence: 0.1 },
          ],
        },
      });
      const { POST } = await load();
      const res = await POST(req({ image: IMAGE, mediaType: 'image/jpeg' }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.items).toHaveLength(3); // the empty line is dropped
      expect(body.items[0]).toEqual({ medicine: 'Comet', strength: '500 mg', frequency: '1+0+1', duration: '30 days', diagnosis_if_written: 'Type 2 DM', confidence: 0.92 });
      expect(body.items[1].confidence).toBe(1);
      expect(body.items[2]).toMatchObject({ medicine: 'call [PHONE]', confidence: 0 });
      const call = parse.mock.calls[0]![0];
      expect(call.model).toBe('model-from-env');
      expect(call.messages[0].content[0]).toMatchObject({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: IMAGE } });
      expect(call.output_config.format).toBeTruthy();
    });

    it('a refusal or an API error falls back to manual entry', async () => {
      const { POST } = await load();
      parse.mockResolvedValueOnce({ stop_reason: 'refusal', parsed_output: null });
      expect((await POST(req({ image: IMAGE, mediaType: 'image/png' }))).status).toBe(502);
      parse.mockRejectedValueOnce(new Error('network'));
      expect(await (await POST(req({ image: IMAGE, mediaType: 'image/png' }))).json()).toEqual({ error: 'failed', reason: 'unknown' });
    });
  });

  describe('with Gemini (LLM_PROVIDER=gemini)', () => {
    const gemini = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }));
    beforeEach(() => {
      process.env.LLM_PROVIDER = 'gemini';
      process.env.GEMINI_API_KEY = 'g-key';
      process.env.GEMINI_MODEL = 'gemini-model-from-env';
    });

    it('reports the provider by name only, and reads the photo through generateContent', async () => {
      const items = [{ medicine: 'Comet', strength: '500 mg', frequency: '1+0+1', duration: '30 days', diagnosis_if_written: '', confidence: 0.9 }];
      const fetchMock = gemini({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ items }) }] } }] });
      vi.stubGlobal('fetch', fetchMock);
      const { GET, POST } = await load();
      const info = await (await GET()).json();
      expect(info).toEqual({ available: true, provider: 'gemini' });
      expect(JSON.stringify(info)).not.toMatch(/g-key|gemini-model/);

      const res = await POST(req({ image: IMAGE, mediaType: 'image/png' }));
      expect(res.status).toBe(200);
      expect((await res.json()).items[0]).toMatchObject({ medicine: 'Comet', confidence: 0.9 });
      expect(parse).not.toHaveBeenCalled();
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-model-from-env:generateContent');
      expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('g-key');
      expect(url).not.toContain('g-key'); // the key is sent in a header, never in the URL
      const body = JSON.parse(init.body as string);
      expect(body.contents[0].parts[0]).toEqual({ inlineData: { mimeType: 'image/png', data: IMAGE } });
      expect(body.systemInstruction.parts[0].text).toMatch(/Do not add, guess, correct or complete/);
      expect(body.generationConfig.responseMimeType).toBe('application/json');
      expect(body.generationConfig.responseSchema.type).toBe('OBJECT');
      expect(JSON.stringify(body.generationConfig.responseSchema)).not.toContain('additionalProperties');
    });

    it('rate limit → busy; blocked or malformed output → manual entry', async () => {
      const { POST } = await load();
      vi.stubGlobal('fetch', gemini({ error: {} }, 429));
      expect((await POST(req({ image: IMAGE, mediaType: 'image/jpeg' }))).status).toBe(429);
      vi.stubGlobal('fetch', gemini({ promptFeedback: { blockReason: 'SAFETY' } }));
      expect((await POST(req({ image: IMAGE, mediaType: 'image/jpeg' }))).status).toBe(502);
      vi.stubGlobal('fetch', gemini({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'not json' }] } }] }));
      expect((await POST(req({ image: IMAGE, mediaType: 'image/jpeg' }))).status).toBe(502);
      vi.stubGlobal('fetch', gemini({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{"items":[' }] } }] }));
      expect((await POST(req({ image: IMAGE, mediaType: 'image/jpeg' }))).status).toBe(502);
    });
  });
});
