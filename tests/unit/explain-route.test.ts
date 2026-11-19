import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/medicine/db', () => ({ getMedicineDb: () => ({}) }));
vi.mock('@/lib/explain/dictionary', () => ({ medicineDictionary: () => new Set(['comet', 'napa', 'paracetamol', 'omeprazole', 'seclo']) }));

const create = vi.fn();
vi.mock('@anthropic-ai/sdk', async (orig) => {
  const actual = await orig<typeof import('@anthropic-ai/sdk')>();
  class FakeAnthropic {
    static RateLimitError = actual.default.RateLimitError;
    messages = { create };
  }
  return { ...actual, default: FakeAnthropic };
});

const BODY = {
  locale: 'en',
  doctorDiagnosis: null,
  lowGlucoseEmergency: false,
  values: [{ test: 'FBS', value: 7.8, unit: 'mmol/L', status: 'high', range: '3.9 - 5.6', rangeSource: 'printed' }],
  medicines: [{ brand: 'Comet', generic: 'Metformin Hydrochloride', strength: '500mg', form: 'Tablet', frequency: '1+0+1', duration: '30 days' }],
  findings: [],
  relations: [{ kind: 'related', test: 'FBS', status: 'high', brands: ['Comet'], linkId: 'bloodSugar', effect: 'lowers' }],
};
const req = (body: unknown) =>
  new Request('http://localhost/api/explain', { method: 'POST', body: JSON.stringify(body) }) as unknown as import('next/server').NextRequest;
const aiText = (text: string, stop_reason = 'end_turn') => ({ stop_reason, content: [{ type: 'text', text }] });

async function post(body: unknown = BODY) {
  vi.resetModules();
  const { POST } = await import('@/app/api/explain/route');
  const res = await POST(req(body));
  return { status: res.status, json: await res.json() };
}

describe('/api/explain', () => {
  beforeEach(() => {
    create.mockReset();
    for (const k of ['ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL', 'GEMINI_API_KEY', 'GEMINI_MODEL', 'LLM_PROVIDER']) delete process.env[k];
  });
  afterEach(() => {
    for (const k of ['ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL', 'GEMINI_API_KEY', 'GEMINI_MODEL', 'LLM_PROVIDER']) delete process.env[k];
    vi.unstubAllGlobals();
  });

  it('without an API key returns the template explanation in the user\'s language', async () => {
    const en = await post();
    expect(en.json).toMatchObject({ source: 'template', reason: 'not_available' });
    expect(en.json.text).toContain('FBS is 7.8 mmol/L, which is above the printed range (3.9 - 5.6).');
    const bn = await post({ ...BODY, locale: 'bn' });
    expect(bn.json.text).toContain('ছাপানো সীমার');
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects free-form input', async () => {
    expect((await post({ question: 'what should I take?' })).status).toBe(400);
  });

  describe('with a key', () => {
    beforeEach(() => {
      process.env.ANTHROPIC_API_KEY = 'k';
      process.env.ANTHROPIC_MODEL = 'model-from-env';
    });

    it('uses the AI text when it passes validation; sends only structured facts', async () => {
      create.mockResolvedValue(aiText('- Your FBS is 7.8 mmol/L, above the range 3.9 - 5.6.\n- Comet is commonly used for high blood sugar. Ask your doctor; do not stop on your own.'));
      const { json } = await post();
      expect(json).toMatchObject({ source: 'ai' });
      const call = create.mock.calls[0]![0];
      expect(call.model).toBe('model-from-env');
      expect(call.system).toMatch(/Never give dose advice/);
      expect(JSON.parse(call.messages[0].content)).toMatchObject({ labValues: [{ test: 'FBS', value: 7.8 }], medicines: [{ brand: 'Comet' }] });
    });

    it.each([
      ['a new medicine', '- Comet and Seclo are used for this.'],
      ['a new number', '- Normal FBS is under 5.5.'],
      ['dose advice', '- You can reduce the dose of Comet.'],
      ['a diagnosis', '- You have diabetes.'],
    ])('falls back to the template when the AI adds %s', async (_label, text) => {
      create.mockResolvedValue(aiText(text));
      const { json } = await post();
      expect(json.source).toBe('template');
      expect(json.reason).toMatch(/^validation_failed:/);
      expect(json.text).not.toContain(text.slice(2));
    });

    it('falls back on truncation, refusal or API error', async () => {
      create.mockResolvedValueOnce(aiText('- FBS is 7.8', 'max_tokens'));
      expect((await post()).json).toMatchObject({ source: 'template', reason: 'incomplete' });
      create.mockResolvedValueOnce({ stop_reason: 'refusal', content: [] });
      expect((await post()).json).toMatchObject({ source: 'template' });
      create.mockRejectedValueOnce(new Error('down'));
      expect((await post()).json).toMatchObject({ source: 'template', reason: 'ai_error' });
    });
  });

  describe('with Gemini', () => {
    const geminiText = (text: string, finishReason = 'STOP') =>
      vi.fn(async () => new Response(JSON.stringify({ candidates: [{ finishReason, content: { parts: [{ text }] } }] })));
    beforeEach(() => {
      process.env.GEMINI_API_KEY = 'g-key';
      process.env.GEMINI_MODEL = 'gemini-model-from-env';
    });

    it('is used when it is the only configured provider; the same validator applies (rule 8)', async () => {
      const ok = geminiText('- Your FBS is 7.8 mmol/L, above the range 3.9 - 5.6.\n- Ask your doctor; do not stop on your own.');
      vi.stubGlobal('fetch', ok);
      expect((await post()).json).toMatchObject({ source: 'ai' });
      const body = JSON.parse((ok.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
      expect(body.systemInstruction.parts[0].text).toMatch(/Never give dose advice/);
      expect(JSON.parse(body.contents[0].parts[0].text)).toMatchObject({ medicines: [{ brand: 'Comet' }] });
      expect(create).not.toHaveBeenCalled();

      vi.stubGlobal('fetch', geminiText('- Comet and Seclo are used for this.'));
      expect((await post()).json).toMatchObject({ source: 'template', reason: 'validation_failed:unknownMedicine' });
      vi.stubGlobal('fetch', geminiText('- FBS is', 'MAX_TOKENS'));
      expect((await post()).json).toMatchObject({ source: 'template', reason: 'incomplete' });
      vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
      expect((await post()).json).toMatchObject({ source: 'template', reason: 'ai_error' });
    });
  });
});
