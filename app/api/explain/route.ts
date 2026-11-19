import { NextResponse, type NextRequest } from 'next/server';
import { createTranslator } from 'next-intl';
import bn from '@/messages/bn.json';
import en from '@/messages/en.json';
import { medicineDictionary } from '@/lib/explain/dictionary';
import { parseExplainInput, type ExplainInput } from '@/lib/explain/input';
import { buildTemplate, type ExplainT } from '@/lib/explain/template';
import { validateExplanation } from '@/lib/explain/validate';
import { getMedicineDb } from '@/lib/medicine/db';
import { llmAvailable, llmText } from '@/lib/server/llm';

/**
 * POST /api/explain — plain-language explanation of ALREADY-CHECKED results (rule 8).
 *
 * Input: only the structured results (values with ranges, confirmed medicines, rule findings, relations, the doctor's
 * written diagnosis). The template explanation is always built from them. If a language model (Anthropic or Gemini) is configured, the
 * model is asked to rephrase the same facts; its text is validated (no new medicine names, no new numbers, no dose
 * advice, no diagnosis) and replaced by the template if it fails. Without a key, the template is returned.
 * Nothing is stored or logged.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MESSAGES = { bn, en } as const;

function translator(locale: ExplainInput['locale']): ExplainT {
  return createTranslator({ locale, messages: MESSAGES[locale], namespace: 'medicine.explain' }) as unknown as ExplainT;
}

const LANGUAGE = { bn: 'Bangla (বাংলা)', en: 'English' } as const;

function systemPrompt(locale: ExplainInput['locale']): string {
  return `You explain checked health results to a patient in Bangladesh, in plain ${LANGUAGE[locale]}.
You receive JSON with lab values (already compared with their ranges), the medicines the patient confirmed,
findings from fixed safety rules, links between medicines and lab values, and the doctor's written diagnosis.

Strict rules:
- Use ONLY the facts in the JSON. Do not add any medical fact, cause, side effect, diagnosis, food or lifestyle advice.
- Never give dose advice. Never tell the patient to stop, start, skip or change any medicine or insulin dose.
  You may say: "Ask your doctor or pharmacist; do not stop on your own."
- Do not write any number that is not in the JSON. Do not count things. Do not number your lines.
- Write medicine names exactly as they appear in the JSON, in Latin letters. Do not mention any other medicine.
- If doctorDiagnosis is present, state it as the doctor's diagnosis and do not suggest any other diagnosis.
- Never say the patient has a disease. Say a value is above or below the range, and use "may" and "possible".
- If lowGlucoseEmergency is true, start with: give something sweet now if the person is unwell, and call 999 if needed.
- Write 120 to 220 words in ${LANGUAGE[locale]}: short sentences, one idea per line, lines starting with "- ", no headings.`;
}

function facts(input: ExplainInput) {
  // Only what the model needs; the order is fixed so identical inputs give identical prompts.
  return {
    doctorDiagnosis: input.doctorDiagnosis,
    lowGlucoseEmergency: input.lowGlucoseEmergency,
    labValues: input.values.map((v) => ({ test: v.test, value: v.value, unit: v.unit, status: v.status, range: v.range, rangeSource: v.rangeSource })),
    medicines: input.medicines.map((m) => ({ brand: m.brand, generic: m.generic, strength: m.strength, frequency: m.frequency, duration: m.duration })),
    safetyFindings: input.findings,
    medicineLinks: input.relations,
  };
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  const input = parseExplainInput(body);
  if (!input) return NextResponse.json({ error: 'invalid_input' }, { status: 400 });

  const template = buildTemplate(input, translator(input.locale));
  const templateText = template.map((l) => `- ${l}`).join('\n');
  const reply = (source: 'ai' | 'template', text: string, reason?: string) =>
    NextResponse.json({ source, text, lines: source === 'template' ? template : undefined, reason }, { headers: { 'Cache-Control': 'no-store' } });

  if (!llmAvailable()) return reply('template', templateText, 'not_available');
  const db = getMedicineDb();
  if (!db) return reply('template', templateText, 'data_not_built'); // cannot validate medicine names → do not use AI

  const result = await llmText({ op: 'explain', system: systemPrompt(input.locale), text: JSON.stringify(facts(input)), maxTokens: 2000 });
  if (!result.ok) return reply('template', templateText, result.error === 'incomplete' ? 'incomplete' : 'ai_error');
  // Rule 8: any new medicine name, number or dose advice → the template is used instead.
  const check = validateExplanation(result.value, input, { dictionary: medicineDictionary(db), allowedText: templateText });
  if (!check.ok) return reply('template', templateText, `validation_failed:${check.reason}`);
  return reply('ai', result.value);
}
