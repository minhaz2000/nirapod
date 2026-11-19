/**
 * A tiny stand-in for the Gemini REST API, for e2e tests of the AI paths (no real key, no internet).
 * Answers generateContent by the TASK marker in the system instruction, like the unit-test fake.
 * Started by playwright.config.ts; the second app server points LLM_TEST_GEMINI_BASE_URL here.
 */
import { createServer } from 'node:http';

const PORT = Number(process.env.MOCK_GEMINI_PORT ?? 3199);
const reply = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};
const text = (t, extra = {}) => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: t }] }, ...extra }] });

createServer((req, res) => {
  if (req.url === '/health') return reply(res, 200, { ok: true });
  if (req.method === 'GET' && req.url?.startsWith('/v1beta/models')) {
    return reply(res, 200, { models: [{ name: 'models/mock-flash', supportedGenerationMethods: ['generateContent'] }] });
  }
  if (req.headers['x-goog-api-key'] !== 'test-key') return reply(res, 400, { error: { code: 400, status: 'INVALID_ARGUMENT', message: 'API key not valid.' } });
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const body = JSON.parse(raw || '{}');
    const system = body.systemInstruction?.parts?.[0]?.text ?? '';
    const user = (body.contents?.[0]?.parts ?? []).map((p) => p.text ?? '').join(' ');
    if (system.includes('TASK: PLAN')) {
      const q = user.toLowerCase();
      const names = /napa/.test(q) ? ['Napa'] : /seclo/.test(q) ? ['Seclo'] : [];
      const intent = /cheap|alternativ/.test(q) ? 'alternatives' : /expir/.test(q) ? 'expiry' : names.length ? 'medicine_info' : 'general';
      return reply(res, 200, text(JSON.stringify({ intent, medicine_names: names, date_text: '' })));
    }
    if (system.includes('TASK: WEB')) {
      return reply(
        res,
        200,
        text('Paracetamol is widely used for pain and fever.', {
          groundingMetadata: {
            groundingChunks: [
              { web: { uri: 'https://www.nhs.uk/medicines/paracetamol-for-adults/', title: 'nhs.uk' } },
              { web: { uri: 'https://medlineplus.gov/druginfo/meds/a681004.html', title: 'medlineplus.gov' } },
            ],
          },
        }),
      );
    }
    if (system.includes('TASK: COMPOSE')) {
      const brand = user.match(/"brand":"([^"]+)"/)?.[1];
      return reply(res, 200, text(brand ? `${brand} is in our medicine list. It is commonly used for fever and pain.` : 'I am not sure. Please ask a doctor or pharmacist.'));
    }
    if (system.includes('medicine packs')) {
      return reply(
        res,
        200,
        text(
          JSON.stringify({
            brand: 'No Pain', generic: 'Diclofenac Potassium BP', strength: '50 mg', dosage_form: 'Tablet', manufacturer: 'Drug International Ltd.',
            expiry_date: 'AUG 27', manufacturing_date: 'SEP 25', batch_number: 'NP2509', dar_number: '076-123-045',
            visible_text: 'No Pain\nDiclofenac Potassium BP 50 mg\nTablet\nDrug International Ltd.',
          }),
        ),
      );
    }
    return reply(res, 200, text('OK'));
  });
}).listen(PORT, () => console.log(`mock gemini on ${PORT}`));
