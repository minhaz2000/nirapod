/**
 * Nirapod Assistant (server). Order of work for each question:
 *   1. Safety rules first, no AI: danger signs / low sugar → Emergency 999 card; dose, start / stop / change,
 *      diagnosis or "is it fake" → refused with a safe pointer (rules 1, 2, 3, 6, 11).
 *   2. Plan: the language model (or keyword rules without AI) picks the intent and medicine names. It never answers.
 *   3. Tools: our checked code — medicine database search, exact-match alternatives, duplicate generics, expiry check,
 *      report explanation. A name the database does not know becomes a "not found" card, never a guess.
 *   4. Web (Gemini only): Google Search grounding for general information, always with source links.
 *   5. Compose: the model rephrases ONLY the tool results (database wins over the web); the answer is validated
 *      (no dose advice, no diagnosis, no "fake/genuine", no medicine names that were not in the results) and replaced
 *      by a deterministic answer if it fails. The UI adds "Information only, not medical advice" to every answer.
 */
import 'server-only';
import { createTranslator } from 'next-intl';
import bn from '@/messages/bn.json';
import en from '@/messages/en.json';
import { medicineDictionary } from '@/lib/explain/dictionary';
import { runExplain } from '@/lib/explain/run';
import { DIAGNOSIS, DOSE_ADVICE, SAFE_PHRASES } from '@/lib/explain/validate';
import { getMedicineDb } from '@/lib/medicine/db';
import { nameKey } from '@/lib/medicine/normalise';
import { redact } from '@/lib/privacy/redact';
import { rangeText } from '@/lib/rules/report-ranges';
import { generateContent, responseText } from '@/lib/server/gemini';
import { llmAvailable, llmJson, llmProvider, llmText, logLlmFailure } from '@/lib/server/llm';
import { selectLlm } from '@/lib/server/llm-select';
import { AUTHENTICITY_WORDS, checkMessage } from './safety';
import { alternativesCard, duplicatesCard, expiryCard, medicineNamesIn, searchMedicine } from './tools';
import type { AssistantCard, AssistantRequest, AssistantResponse, MedicineSummary, Source } from './types';

const MESSAGES = { bn, en } as const;
type T = (key: string, values?: Record<string, string | number>) => string;
const translator = (locale: 'bn' | 'en'): T => createTranslator({ locale, messages: MESSAGES[locale], namespace: 'assistant.answers' }) as unknown as T;

export type Intent = 'medicine_info' | 'alternatives' | 'expiry' | 'duplicates' | 'report' | 'general' | 'other';
const INTENTS: readonly Intent[] = ['medicine_info', 'alternatives', 'expiry', 'duplicates', 'report', 'general', 'other'];

export interface Plan {
  intent: Intent;
  names: string[];
  dateText: string;
}

/** Keyword plan, used without AI and as a check on the model's plan. */
export function rulePlan(text: string, hasPack: boolean, hasReport: boolean, hasRx: boolean): Plan {
  const t = text.toLowerCase();
  const dateText = text.match(/(?:exp\w*[\s.:]*)?((?:\d{1,2}[./\-])?\d{1,2}[./\-]\d{2,4}|[a-z]{3,9}\.?\s*\d{2,4})/i)?.[1] ?? '';
  const names = medicineNamesIn(text);
  let intent: Intent = 'medicine_info';
  if (/cheap|alternativ|substitut|same\s*generic|price|সস্তা|বিকল্প|দাম/.test(t)) intent = 'alternatives';
  else if (/expir|exp\b|মেয়াদ/.test(t)) intent = 'expiry';
  else if (/report|test\s*result|রিপোর্ট|পরীক্ষা/.test(t) && hasReport) intent = 'report';
  else if (/report|রিপোর্ট/.test(t)) intent = 'report';
  else if (/duplicate|same\s*medicine\s*twice|together|দুবার|একই\s*ওষুধ/.test(t) || (hasRx && /prescription|প্রেসক্রিপশন/.test(t))) intent = 'duplicates';
  else if (!names.length && !hasPack) intent = 'general';
  return { intent, names, dateText };
}

const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    intent: { type: 'string', description: `One of: ${INTENTS.join(', ')}.` },
    medicine_names: { type: 'array', items: { type: 'string', description: 'A medicine name exactly as the user wrote it.' } },
    date_text: { type: 'string', description: 'An expiry date the user typed, exactly as written, else empty.' },
  },
  required: ['intent', 'medicine_names', 'date_text'],
  additionalProperties: false,
} as const;

const PLAN_SYSTEM = `TASK: PLAN. You route a health-app question to tools. You never answer the question yourself.
Intents: medicine_info (what a medicine is / is used for), alternatives (cheaper brand with the same generic),
expiry (when a pack expires), duplicates (the same generic twice among medicines), report (explain a lab report),
general (a general health question with no specific medicine), other.
Copy medicine names exactly as written by the user (brand or generic, any language). Output JSON only.`;

function compactHistory(req: AssistantRequest) {
  return req.messages
    .slice(-6)
    .map((m) => `${m.role}: ${redact(m.text).slice(0, 500)}`)
    .join('\n');
}

async function webSummary(name: string, generic: string | null, locale: 'bn' | 'en'): Promise<{ text: string; sources: Source[] } | { error: string }> {
  const c = selectLlm();
  if (!c || c.provider !== 'gemini') return { error: 'web_not_available' };
  const lang = locale === 'bn' ? 'Bangla' : 'English';
  const r = await generateContent(
    { apiKey: c.apiKey, model: c.model },
    {
      systemInstruction: {
        parts: [{ text: `TASK: WEB. Give general, well-established patient information from reliable health sources. No doses, no dosing schedules, no advice to start, stop or change any medicine, no diagnosis. Never call a medicine fake or genuine. 2-4 short sentences in ${lang}.` }],
      },
      contents: [{ role: 'user', parts: [{ text: `What is the medicine "${name}"${generic ? ` (generic: ${generic})` : ''} generally used for, and what general precautions apply?` }] }],
      tools: [{ google_search: {} }],
      generationConfig: { maxOutputTokens: 4096 },
    },
    45_000,
  );
  if (!r.ok) {
    logLlmFailure('assistant-web', 'gemini', r.kind, r.message);
    return { error: r.kind };
  }
  const chunks = r.json.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const sources = chunks
    .flatMap((ch) => (ch.web?.uri ? [{ uri: ch.web.uri, title: ch.web.title || new URL(ch.web.uri).hostname }] : []))
    .filter((s, i, all) => all.findIndex((x) => x.uri === s.uri) === i)
    .slice(0, 5);
  const text = responseText(r.json);
  // No sources → the web text is not used (every web fact must be traceable).
  return text && sources.length ? { text: text.slice(0, 1200), sources } : { error: 'no_sources' };
}

/** Deterministic answer from the cards (used without AI, and whenever the model's answer fails validation). */
export function templateAnswer(cards: AssistantCard[], t: T): string {
  const lines: string[] = [];
  for (const c of cards) {
    switch (c.type) {
      case 'medicine':
        lines.push(
          c.medicine.genericOnly
            ? t('genericOnly', { generic: c.medicine.generic ?? c.medicine.brand })
            : t('medicine', { brand: c.medicine.brand, generic: c.medicine.generic ?? '—', strength: c.medicine.strength || '—', form: c.medicine.form }),
        );
        if (c.medicine.indication) lines.push(t('usedFor', { use: c.medicine.indication }));
        break;
      case 'alternatives':
        lines.push(
          c.status !== 'ok'
            ? t('notComparable', { brand: c.medicine.brand })
            : c.alternatives.some((a) => a.cheaper)
              ? t('alternatives', { brand: c.medicine.brand, list: c.alternatives.filter((a) => a.cheaper).map((a) => a.brand).join(', ') })
              : t('noCheaper', { brand: c.medicine.brand }),
        );
        lines.push(t('pharmacist'));
        break;
      case 'duplicates':
        lines.push(c.groups.length ? t('duplicates', { list: c.groups.map((g) => `${g.ingredient}: ${g.brands.join(' + ')}`).join('; ') }) : t('noDuplicates'));
        break;
      case 'expiry':
        lines.push(c.status === 'unknown' ? t('expiryUnknown') : t(`expiry.${c.status}`, { date: c.exp ?? '' }));
        break;
      case 'notFound':
        lines.push(t('notFound', { query: c.query }));
        break;
      case 'report':
        lines.push(c.explanation);
        break;
      case 'unsure':
        lines.push(t('unsure'));
        break;
      default:
        break;
    }
  }
  return lines.join('\n') || t('unsure');
}

/** Rule-checks a composed answer. */
export function validateAnswer(text: string, factsText: string, dictionary: ReadonlySet<string>): { ok: true } | { ok: false; reason: string } {
  if (!text.trim()) return { ok: false, reason: 'empty' };
  if (text.length > 1500) return { ok: false, reason: 'tooLong' };
  const withoutSafe = SAFE_PHRASES.reduce((acc, re) => acc.replace(re, ' '), text);
  if (DOSE_ADVICE.some((re) => re.test(withoutSafe))) return { ok: false, reason: 'doseAdvice' };
  if (/\b\d+(?:\.\d+)?\s*(?:mg|mcg|ml|units?|tablets?|times)\s*(?:a|per|every)\s*(?:day|daily|hours?)\b/i.test(text)) return { ok: false, reason: 'doseAdvice' };
  if (DIAGNOSIS.some((re) => re.test(text))) return { ok: false, reason: 'diagnosis' };
  if (AUTHENTICITY_WORDS.test(text)) return { ok: false, reason: 'authenticity' };
  const allowed = new Set(nameKey(factsText).split(' '));
  for (const w of nameKey(text).split(' ')) if (w.length >= 4 && dictionary.has(w) && !allowed.has(w)) return { ok: false, reason: `unknownMedicine:${w}` };
  return { ok: true };
}

const COMPOSE_SYSTEM = (lang: string) => `TASK: COMPOSE. You are Nirapod, a careful health helper for people in Bangladesh. Answer in ${lang}.
Use ONLY the facts in TOOL RESULTS and WEB. If they disagree, the TOOL RESULTS (our verified medicine database) win.
Rules: never give, suggest or change a dose; never tell anyone to start, stop, skip or switch a medicine (you may say
"Ask your doctor or pharmacist; do not stop on your own"); never diagnose (say "may" / "possible"); never say a medicine
is fake or genuine; if the facts do not answer the question, say you are not sure and suggest a doctor or pharmacist.
Do not mention medicines that are not in the facts. 2-6 short sentences, plain words, no headings, no markdown.
Do not add a disclaimer (the app adds one).`;

export async function answerQuestion(req: AssistantRequest, today = new Date()): Promise<AssistantResponse> {
  const t = translator(req.locale);
  const last = redact([...req.messages].reverse().find((m) => m.role === 'user')?.text ?? '').slice(0, 1000);
  const aiAvailable = llmAvailable();
  const base = { sources: [] as Source[], aiAvailable };

  // 1. Safety rules, no AI.
  const safety = checkMessage(last);
  if (safety.emergency) {
    return { ...base, source: 'safety', cards: [{ type: 'emergency', lowGlucose: safety.lowGlucose }], answer: t(safety.lowGlucose ? 'emergencyLow' : 'emergency') };
  }
  // Rule 6: a low glucose value in a report the user shared → Emergency first, too.
  if (req.context?.report?.some((v) => v.lowGlucoseEmergency) && /report|রিপোর্ট|explain|ব্যাখ্যা/i.test(last)) {
    return { ...base, source: 'safety', cards: [{ type: 'emergency', lowGlucose: true }], answer: t('emergencyLow') };
  }
  if (safety.refuse) return { ...base, source: 'safety', cards: [{ type: 'refusal', reason: safety.refuse }], answer: t(`refuse.${safety.refuse}`) };

  const ctx = req.context ?? {};
  // 2. Plan.
  let plan = rulePlan(last, Boolean(ctx.pack), Boolean(ctx.report?.length), Boolean(ctx.prescription?.length));
  let aiError: string | undefined;
  if (aiAvailable) {
    const r = await llmJson<{ intent?: string; medicine_names?: unknown; date_text?: string }>({
      op: 'assistant-plan',
      system: PLAN_SYSTEM,
      text: `${compactHistory(req)}\n\nKnown from photos: ${ctx.pack?.medicine ? `pack = ${ctx.pack.medicine.brand}` : 'no pack'}; ${ctx.report?.length ? 'a lab report' : 'no report'}; ${ctx.prescription?.length ? `prescription = ${ctx.prescription.map((l) => l.medicine).join(', ')}` : 'no prescription'}.`,
      schema: PLAN_SCHEMA,
      maxTokens: 400,
    });
    if (r.ok) {
      const intent = INTENTS.includes(r.value.intent as Intent) ? (r.value.intent as Intent) : plan.intent;
      const names = Array.isArray(r.value.medicine_names) ? r.value.medicine_names.filter((n): n is string => typeof n === 'string').map((n) => redact(n).slice(0, 60)).slice(0, 4) : [];
      plan = { intent, names: names.length ? names : plan.names, dateText: r.value.date_text?.slice(0, 40) || plan.dateText };
    } else aiError = r.error;
  }

  // 3. Tools.
  const cards: AssistantCard[] = [];
  const found: MedicineSummary[] = [];
  const lookup = (name: string) => {
    const hit = searchMedicine(name);
    if (hit) found.push(hit.medicine);
    else cards.push({ type: 'notFound', query: name });
    return hit?.medicine ?? null;
  };
  const target = (): MedicineSummary | null => (plan.names[0] ? lookup(plan.names[0]) : (ctx.pack?.medicine ?? null));

  switch (plan.intent) {
    case 'alternatives': {
      const m = target();
      const card = m ? alternativesCard(m) : null;
      if (m) cards.push({ type: 'medicine', medicine: m, matchedAs: plan.names[0] ?? m.brand });
      if (card) cards.push(card);
      if (!m && !plan.names.length) cards.push({ type: 'unsure' });
      break;
    }
    case 'expiry':
      if (plan.dateText) cards.push(expiryCard(plan.dateText, today));
      else if (ctx.pack) cards.push({ type: 'expiry', status: ctx.pack.expiry, exp: ctx.pack.exp });
      else cards.push({ type: 'unsure' });
      break;
    case 'duplicates': {
      const names = ctx.prescription?.length ? ctx.prescription.map((l) => l.medicine) : plan.names;
      const card = duplicatesCard(names);
      cards.push(card ?? { type: 'unsure' });
      break;
    }
    case 'report':
      if (ctx.report?.length) {
        const r = await runExplain({ locale: req.locale, doctorDiagnosis: null, values: ctx.report.map((v) => ({ test: v.name, value: v.value, unit: v.unit, status: v.status, range: rangeText(v), rangeSource: v.rangeSource })), lowGlucoseEmergency: ctx.report.some((v) => v.lowGlucoseEmergency), medicines: [], findings: [], relations: [] });
        cards.push({ type: 'report', values: ctx.report, explanation: r.text, explanationSource: r.source });
      } else cards.push({ type: 'unsure' });
      break;
    case 'medicine_info': {
      const m = target();
      if (m) cards.push({ type: 'medicine', medicine: m, matchedAs: plan.names[0] ?? m.brand });
      else if (!plan.names.length) cards.push({ type: 'unsure' });
      break;
    }
    default:
      break;
  }

  // 4. Web (general information, always with sources).
  let web: { text: string; sources: Source[] } | null = null;
  const webFor = cards.find((c): c is Extract<AssistantCard, { type: 'medicine' }> => c.type === 'medicine')?.medicine;
  if (aiAvailable && llmProvider() === 'gemini' && (plan.intent === 'medicine_info' || plan.intent === 'general') && (webFor || plan.intent === 'general')) {
    const w = await webSummary(webFor?.brand ?? last.slice(0, 120), webFor?.generic ?? null, req.locale);
    if ('text' in w) {
      web = w;
      cards.push({ type: 'sources', sources: w.sources });
    }
  }
  if (!cards.length) cards.push({ type: 'unsure' });

  // 5. Compose (validated) or template.
  const template = templateAnswer(cards, t);
  if (!aiAvailable || aiError) return { ...base, sources: web?.sources ?? [], source: 'template', cards, answer: template, ...(aiError ? { aiError } : {}) };
  const facts = { question: last, tool_results: cards.filter((c) => c.type !== 'sources'), web: web?.text ?? null };
  const factsText = JSON.stringify(facts) + template;
  const r = await llmText({ op: 'assistant-compose', system: COMPOSE_SYSTEM(req.locale === 'bn' ? 'Bangla' : 'English'), text: JSON.stringify(facts), maxTokens: 800 });
  const db = getMedicineDb();
  if (r.ok && db) {
    const check = validateAnswer(r.value, factsText, medicineDictionary(db));
    if (check.ok) return { ...base, sources: web?.sources ?? [], source: 'ai', cards, answer: r.value.trim() };
    console.warn(`[assistant] composed answer rejected: ${check.reason}`);
  }
  return { ...base, sources: web?.sources ?? [], source: 'template', cards, answer: template, ...(!r.ok ? { aiError: r.error } : {}) };
}
