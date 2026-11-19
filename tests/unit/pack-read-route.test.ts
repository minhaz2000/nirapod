import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const IMAGE = Buffer.from('pack photo bytes').toString('base64');
const req = (body: unknown) =>
  new Request('http://localhost/api/pack/read', { method: 'POST', body: JSON.stringify(body) }) as unknown as import('next/server').NextRequest;
const ENV = ['ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL', 'GEMINI_API_KEY', 'GEMINI_MODEL', 'LLM_PROVIDER'];

async function load() {
  vi.resetModules();
  return import('@/app/api/pack/read/route');
}
const gemini = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }));
const answer = (fields: Record<string, string>) => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(fields) }] } }] });

describe('/api/pack/read', () => {
  beforeEach(() => ENV.forEach((k) => delete process.env[k]));
  afterEach(() => {
    ENV.forEach((k) => delete process.env[k]);
    vi.unstubAllGlobals();
  });

  it('without a key: not available (the app reads the pack on the phone)', async () => {
    const { GET, POST } = await load();
    expect(await (await GET()).json()).toEqual({ available: false, provider: null });
    expect((await POST(req({ image: IMAGE, mediaType: 'image/jpeg' }))).status).toBe(503);
  });

  describe('with Gemini', () => {
    beforeEach(() => {
      process.env.LLM_PROVIDER = 'gemini';
      process.env.GEMINI_API_KEY = 'g-key';
      process.env.GEMINI_MODEL = 'gemini-model-from-env';
    });

    it('asks for JSON with every pack field and returns the cleaned fields', async () => {
      const fetchMock = gemini(answer({ brand: ' No Pain ', generic: 'Diclofenac Potassium BP', strength: '50 mg', dosage_form: 'Tablet', manufacturer: 'Drug International Ltd.', expiry_date: 'EXP 02/2027', manufacturing_date: '03/2025', batch_number: 'NP2503', dar_number: '076-123-045', visible_text: 'No Pain\nDiclofenac Potassium BP 50 mg' }));
      vi.stubGlobal('fetch', fetchMock);
      const { POST } = await load();
      const res = await POST(req({ image: IMAGE, mediaType: 'image/jpeg' }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.fields).toMatchObject({ brand: 'No Pain', strength: '50 mg', batch_number: 'NP2503', dar_number: '076-123-045' });
      const sent = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
      expect(sent.generationConfig.responseMimeType).toBe('application/json');
      expect(Object.keys(sent.generationConfig.responseSchema.properties)).toEqual(['brand', 'generic', 'strength', 'dosage_form', 'manufacturer', 'expiry_date', 'manufacturing_date', 'batch_number', 'dar_number', 'visible_text']);
      expect(sent.systemInstruction.parts[0].text).toMatch(/Never guess/);
      expect(sent.systemInstruction.parts[0].text).toMatch(/genuine or fake/);
      expect(sent.contents[0].parts[0].inlineData).toEqual({ mimeType: 'image/jpeg', data: IMAGE });
    });

    it('missing fields become empty strings; failures and rate limits are reported', async () => {
      const { POST } = await load();
      vi.stubGlobal('fetch', gemini(answer({ brand: 'Napa' })));
      expect((await (await POST(req({ image: IMAGE, mediaType: 'image/png' }))).json()).fields).toMatchObject({ brand: 'Napa', expiry_date: '', visible_text: '' });
      vi.stubGlobal('fetch', gemini({}, 429));
      expect((await POST(req({ image: IMAGE, mediaType: 'image/png' }))).status).toBe(429);
      vi.stubGlobal('fetch', gemini({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'not json' }] } }] }));
      expect((await POST(req({ image: IMAGE, mediaType: 'image/png' }))).status).toBe(502);
      expect((await POST(req({ image: 'not base64!', mediaType: 'image/png' }))).status).toBe(400);
    });
  });
});
