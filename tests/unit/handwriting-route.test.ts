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
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_MODEL;
  });
  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_MODEL;
  });

  it('without an API key: "not available", and the SDK is never called', async () => {
    const { GET, POST } = await load();
    expect(await (await GET()).json()).toEqual({ available: false });
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
      expect(await (await POST(req({ image: IMAGE, mediaType: 'image/png' }))).json()).toEqual({ error: 'failed' });
    });
  });
});
