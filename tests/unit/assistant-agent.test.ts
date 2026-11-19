import Database from 'better-sqlite3';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { formKey, nameKey, strengthKey } from '@/lib/medicine/normalise';
import { MEDICINE_INDEXES, MEDICINE_SCHEMA } from '@/lib/medicine/schema';

vi.mock('server-only', () => ({}));
const db = new Database(':memory:');
vi.mock('@/lib/medicine/db', () => ({ getMedicineDb: () => db }));
vi.mock('@/lib/explain/dictionary', () => ({ medicineDictionary: () => new Set(['napa', 'ace', 'seclo', 'paracetamol', 'omeprazole', 'fast', 'reset']) }));

beforeAll(() => {
  db.exec(MEDICINE_SCHEMA);
  db.exec(MEDICINE_INDEXES);
  db.prepare("INSERT INTO meta VALUES ('data_last_updated', '2021-09')").run();
  const gen = db.prepare('INSERT INTO generics VALUES (?, ?, ?, ?, ?, ?)');
  gen.run(1, 'Paracetamol', 'paracetamol', 'Fever and mild to moderate pain', 'Analgesic', 'B');
  gen.run(2, 'Omeprazole', 'omeprazole', 'Peptic ulcer, reflux', 'Proton pump inhibitor', 'C');
  const ins = db.prepare('INSERT INTO products VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  const add = (id: number, brand: string, g: number, gk: string, form: string, strength: string, price: number) =>
    ins.run(id, brand, nameKey(brand), g, gk, null, 'Maker Ltd.', form, formKey(form), strength, strengthKey(strength), price, 'piece', '[]');
  add(1, 'Napa', 1, 'paracetamol', 'Tablet', '500mg', 0.8);
  add(2, 'Ace', 1, 'paracetamol', 'Tablet', '500mg', 0.7);
  add(3, 'Reset', 1, 'paracetamol', 'Tablet', '500mg', 0.6);
  add(4, 'Seclo', 2, 'omeprazole', 'Capsule', '20mg', 5);
});

const ENV = ['ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL', 'GEMINI_API_KEY', 'GEMINI_MODEL', 'LLM_PROVIDER'];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const textAnswer = (text: string, extra: Record<string, unknown> = {}) => json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text }] }, ...extra }] });

/** A fake Gemini: answers by the TASK marker in the system instruction. */
function fakeGemini(opts: { plan?: unknown; compose?: string; web?: boolean; fail?: number } = {}) {
  return vi.fn(async (_url: string, init: RequestInit) => {
    if (opts.fail) return json({ error: { code: opts.fail, status: 'NOT_FOUND', message: 'models/x is not found for API version v1beta' } }, opts.fail);
    const body = JSON.parse(init.body as string);
    const system = body.systemInstruction?.parts?.[0]?.text ?? '';
    if (system.includes('TASK: PLAN')) return textAnswer(JSON.stringify(opts.plan ?? { intent: 'medicine_info', medicine_names: ['Napa'], date_text: '' }));
    if (system.includes('TASK: WEB')) {
      expect(body.tools).toEqual([{ google_search: {} }]);
      return opts.web === false
        ? textAnswer('no sources here')
        : textAnswer('Paracetamol is a common pain and fever medicine.', {
            groundingMetadata: { groundingChunks: [{ web: { uri: 'https://www.nhs.uk/medicines/paracetamol-for-adults/', title: 'nhs.uk' } }, { web: { uri: 'https://medlineplus.gov/druginfo/meds/a681004.html', title: 'medlineplus.gov' } }] },
          });
    }
    if (system.includes('TASK: COMPOSE')) return textAnswer(opts.compose ?? 'Napa is paracetamol, commonly used for fever and pain.');
    return textAnswer('OK');
  });
}

async function ask(text: string, extra: Record<string, unknown> = {}) {
  vi.resetModules();
  const { answerQuestion } = await import('@/lib/assistant/agent');
  return answerQuestion({ locale: 'en', messages: [{ role: 'user', text }], ...extra }, new Date(2026, 10, 19));
}

describe('Nirapod Assistant', () => {
  beforeEach(() => ENV.forEach((k) => delete process.env[k]));
  afterEach(() => {
    ENV.forEach((k) => delete process.env[k]);
    vi.unstubAllGlobals();
  });

  describe('safety first (no AI call at all)', () => {
    beforeEach(() => Object.assign(process.env, { LLM_PROVIDER: 'gemini', GEMINI_API_KEY: 'k', GEMINI_MODEL: 'm' }));

    it('a dose question is refused', async () => {
      const f = fakeGemini();
      vi.stubGlobal('fetch', f);
      const r = await ask('How many Napa can I take a day?');
      expect(r.cards).toEqual([{ type: 'refusal', reason: 'dose' }]);
      expect(r.answer).toMatch(/Ask your doctor or pharmacist; do not stop on your own/);
      expect(f).not.toHaveBeenCalled();
    });

    it('a danger sign shows the Emergency 999 card first', async () => {
      const f = fakeGemini();
      vi.stubGlobal('fetch', f);
      const r = await ask('My father has chest pain, what medicine should he take?');
      expect(r.cards[0]).toEqual({ type: 'emergency', lowGlucose: false });
      expect(r.answer).toMatch(/999/);
      expect(f).not.toHaveBeenCalled();
    });

    it('low sugar: emergency with "something sweet"', async () => {
      vi.stubGlobal('fetch', fakeGemini());
      const r = await ask('my sugar is 3.1, can I skip lunch?');
      expect(r.cards[0]).toEqual({ type: 'emergency', lowGlucose: true });
      expect(r.answer).toMatch(/sweet/);
      expect(r.answer).not.toMatch(/skip|less food/i);
    });

    it('never says fake or genuine', async () => {
      vi.stubGlobal('fetch', fakeGemini());
      const r = await ask('Is my Napa fake?');
      expect(r.cards).toEqual([{ type: 'refusal', reason: 'authenticity' }]);
      expect(r.answer).not.toMatch(/\b(fake|genuine)\b/i);
    });
  });

  it('without AI: a name question is answered from the database (no web sources)', async () => {
    const r = await ask('What is Napa?');
    expect(r).toMatchObject({ aiAvailable: false, source: 'template', sources: [] });
    expect(r.cards[0]).toMatchObject({ type: 'medicine', medicine: { brand: 'Napa', generic: 'Paracetamol', strength: '500mg' } });
    expect(r.answer).toContain('Napa (Paracetamol, 500mg, Tablet) is in our medicine list.');
  });

  it('without AI: cheaper alternatives match generic, strength and form, with "Confirm with your pharmacist"', async () => {
    const r = await ask('Cheaper alternative to Napa?');
    const alt = r.cards.find((c) => c.type === 'alternatives');
    expect(alt).toMatchObject({ status: 'ok' });
    expect(alt && 'alternatives' in alt ? alt.alternatives.map((a) => a.brand) : []).toEqual(['Reset', 'Ace']);
    expect(r.answer).toMatch(/Confirm with your pharmacist/);
  });

  it('unknown medicine: "not in our medicine list", never a guess', async () => {
    const r = await ask('What is Zyxorin?');
    expect(r.cards.some((c) => c.type === 'unsure' || c.type === 'notFound')).toBe(true);
    expect(r.cards.some((c) => c.type === 'medicine')).toBe(false);
  });

  it('expiry from a typed date (labelled date only)', async () => {
    const r = await ask('My pack says EXP 08/2027, when does it expire?');
    expect(r.cards).toContainEqual({ type: 'expiry', status: 'ok', exp: '08/2027' });
  });

  describe('with Gemini (mocked)', () => {
    beforeEach(() => Object.assign(process.env, { LLM_PROVIDER: 'gemini', GEMINI_API_KEY: 'k', GEMINI_MODEL: 'm' }));

    it('a name question returns database info and web sources; the answer is the validated AI text', async () => {
      vi.stubGlobal('fetch', fakeGemini());
      const r = await ask('What is Napa used for?');
      expect(r.source).toBe('ai');
      expect(r.cards[0]).toMatchObject({ type: 'medicine', medicine: { brand: 'Napa', generic: 'Paracetamol' } });
      expect(r.sources.map((s) => s.uri)).toEqual(['https://www.nhs.uk/medicines/paracetamol-for-adults/', 'https://medlineplus.gov/druginfo/meds/a681004.html']);
      expect(r.cards).toContainEqual({ type: 'sources', sources: r.sources });
    });

    it('web text without sources is not used', async () => {
      vi.stubGlobal('fetch', fakeGemini({ web: false }));
      const r = await ask('What is Napa used for?');
      expect(r.sources).toEqual([]);
      expect(r.cards.some((c) => c.type === 'sources')).toBe(false);
    });

    it.each([
      ['dose advice', 'Take 2 tablets of Napa 3 times a day.'],
      ['a diagnosis', 'You have diabetes, so Napa is fine.'],
      ['a medicine not in the results', 'Napa is like Seclo.'],
      ['fake / genuine', 'This Napa looks genuine.'],
    ])('an answer with %s is replaced by the database template', async (_l, compose) => {
      vi.stubGlobal('fetch', fakeGemini({ compose }));
      const r = await ask('What is Napa used for?');
      expect(r.source).toBe('template');
      expect(r.answer).not.toContain(compose);
      expect(r.answer).toContain('Napa (Paracetamol, 500mg, Tablet) is in our medicine list.');
    });

    it('when Gemini fails (invalid model), the database answer is still given and the reason is reported', async () => {
      vi.stubGlobal('fetch', fakeGemini({ fail: 404 }));
      const r = await ask('What is Napa?');
      expect(r).toMatchObject({ source: 'template', aiError: 'invalid_model' });
      expect(r.cards[0]).toMatchObject({ type: 'medicine', medicine: { brand: 'Napa' } });
    });

    it('a pack identified from a photo is the context for "When does it expire?"', async () => {
      vi.stubGlobal('fetch', fakeGemini({ plan: { intent: 'expiry', medicine_names: [], date_text: '' } }));
      const pack = { medicine: { id: 1, brand: 'Napa', generic: 'Paracetamol', strength: '500mg', form: 'Tablet', manufacturer: null, indication: null }, expiry: 'ok', exp: '08/2027' };
      const r = await ask('When does it expire?', { context: { pack } });
      expect(r.cards).toContainEqual({ type: 'expiry', status: 'ok', exp: '08/2027' });
    });
  });
});
