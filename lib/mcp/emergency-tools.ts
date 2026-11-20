/**
 * Nirapod Emergency MCP tools as plain functions (unit-tested without MCP), built only on the app's rules:
 * lib/rules/danger-signs.ts + config/danger-signs.ts (the checklist and advice), the assistant's English / Bangla
 * danger-sign phrases (lib/assistant/safety.ts), lib/rules/glucose.ts + config/glucose.ts (rule 6), the report
 * glucose ranges (lib/rules/report-ranges.ts) and lib/emergency/location.ts. No user data is stored or logged.
 */
import { DANGER_SIGN_GROUPS, LOW_GLUCOSE_DANGER_BELOW_MMOL } from '@/config/danger-signs';
import { GLUCOSE_CONFIG } from '@/config/glucose';
import { GLUCOSE_TARGETS } from '@/config/glucose-targets';
import { checkMessage, glucoseInText } from '@/lib/assistant/safety';
import { hospitalsSearchUrl } from '@/lib/emergency/location';
import { assessDangerSigns, DANGER_SIGN_IDS, isDangerSignId, type DangerSignId } from '@/lib/rules/danger-signs';
import { formatGlucose, isLowGlucose, toMmol } from '@/lib/rules/glucose';
import { checkValue, rangeText } from '@/lib/rules/report-ranges';
import { mcpTranslator, pickLanguage, type McpLanguage, type McpT } from './i18n';
import { assertSafeOutput } from './output-safety';

const MGDL_THRESHOLD = Math.round(LOW_GLUCOSE_DANGER_BELOW_MMOL * GLUCOSE_CONFIG.mgdlPerMmol);

export const signLabel = (t: McpT, id: DangerSignId) =>
  t(`emergency.signs.${id}.label`, { mmol: LOW_GLUCOSE_DANGER_BELOW_MMOL, mgdl: MGDL_THRESHOLD });

/** check_danger_signs: checklist ids and / or free text (English or Bangla). */
export function checkDangerSigns(input: { signs?: readonly string[]; text?: string; language?: McpLanguage }) {
  const lang = pickLanguage(input.language, input.signs, input.text);
  const t = mcpTranslator(lang);
  const selected = new Set<DangerSignId>();
  for (const s of input.signs ?? []) {
    if (isDangerSignId(s)) selected.add(s);
    else for (const id of checkMessage(s).signs) selected.add(id);
  }
  if (input.text) for (const id of checkMessage(input.text).signs) selected.add(id);
  const glucose = [input.text, ...(input.signs ?? [])].map((s) => (s ? glucoseInText(s) : null)).find((v) => v !== null) ?? undefined;
  const a = assessDangerSigns({ selected: [...selected], glucoseMmol: glucose ?? undefined });

  const lines: string[] = [];
  if (a.emergency) {
    lines.push(t('emergency.alert.title')); // "Possible emergency — call 999 now" — always the first line
    lines.push(t('mcp.emergency.matched'), ...a.triggered.map((id) => `- ${signLabel(t, id)}`));
    for (const adv of a.advice) lines.push(t(`emergency.advice.${adv}`));
  } else {
    lines.push(t('mcp.emergency.noSign'));
  }
  lines.push(t('emergency.about999'), t('mcp.emergency.info'));
  const answer = assertSafeOutput(lines.join('\n'));
  return {
    possible_emergency: a.emergency,
    matched_signs: a.triggered.map((id) => ({ id, label: signLabel(t, id) })),
    advice: a.advice.map((k) => t(`emergency.advice.${k}`)),
    call: '999',
    language: lang,
    answer,
  };
}

export type GlucoseUnitLabel = 'mmol/L' | 'mg/dL';
export type GlucoseWhen = 'fasting' | 'random' | 'after_meal';

/** check_glucose_level: rule 6 first — below 3.9 mmol/L (70 mg/dL) the answer starts with the low-sugar guidance. */
export function checkGlucoseLevel(input: { value: number; unit: GlucoseUnitLabel; when?: GlucoseWhen; language?: McpLanguage }) {
  const lang = pickLanguage(input.language);
  const t = mcpTranslator(lang);
  const unit = input.unit === 'mg/dL' ? 'mgdl' : 'mmol';
  const mmol = toMmol(input.value, unit);
  const shown = unit === 'mmol' ? `${input.value} mmol/L (${formatGlucose(mmol, 'mgdl')} mg/dL)` : `${input.value} mg/dL (${formatGlucose(mmol, 'mmol')} mmol/L)`;
  const threshold = { mmol: LOW_GLUCOSE_DANGER_BELOW_MMOL, mgdl: MGDL_THRESHOLD };
  const low = mmol > 0 && isLowGlucose(mmol);
  const plausible = mmol >= GLUCOSE_TARGETS.plausible.mmolMin && mmol <= GLUCOSE_TARGETS.plausible.mmolMax;
  const lines: string[] = [];
  let status: 'low_emergency' | 'below_range' | 'within_range' | 'above_range' | 'check_number' = 'within_range';
  let usual: string | null = null;

  if (low) {
    status = 'low_emergency';
    lines.push(t('diabetes.lowSugarBody')); // "Take something sweet now … call 999." — always the first line
    lines.push(t('mcp.emergency.lowBelow', { value: shown, ...threshold }));
    lines.push(t('emergency.advice.nothingByMouth'));
    if (!plausible) lines.push(t('mcp.emergency.implausible', { value: shown }));
  } else if (!plausible) {
    status = 'check_number';
    lines.push(t('mcp.emergency.implausible', { value: shown }));
  } else {
    lines.push(t('mcp.emergency.notLow', { value: shown, ...threshold }));
    const when = input.when ?? 'random';
    const key = `${when}_glucose`;
    const c = checkValue({ name: key, key, value: Number(formatGlucose(mmol, 'mmol')), unit: 'mmol/L', range: null, rangeNote: null, printedFlag: null });
    usual = rangeText(c);
    if (usual) {
      status = c.status === 'high' ? 'above_range' : c.status === 'low' ? 'below_range' : 'within_range';
      lines.push(t('mcp.emergency.usualRange', { when, range: `${usual} mmol/L`, status: c.status }));
    }
    if (c.status === 'high') lines.push(t('mcp.emergency.highNote'));
  }
  lines.push(t('mcp.emergency.info'));
  return {
    value: input.value,
    unit: input.unit,
    mmol_per_l: Number(formatGlucose(mmol, 'mmol')),
    mg_per_dl: Number(formatGlucose(mmol, 'mgdl')),
    status,
    low_sugar_emergency: low,
    low_threshold: { mmol_per_l: threshold.mmol, mg_per_dl: threshold.mgdl },
    usual_range_mmol_per_l: usual,
    language: lang,
    answer: assertSafeOutput(lines.join('\n')),
  };
}

/** nearby_hospitals_link: a Google Maps search link; the coordinates are not stored or logged. */
export function nearbyHospitalsLink(input: { lat: number; lon: number; language?: McpLanguage }) {
  const t = mcpTranslator(pickLanguage(input.language));
  const url = hospitalsSearchUrl({ latitude: input.lat, longitude: input.lon });
  return { url, call: '999', answer: assertSafeOutput([t('mcp.emergency.hospitals', { url }), t('mcp.emergency.hospitalsNote')].join('\n')) };
}

/** nirapod://emergency-rules: the danger-sign checklist, advice, low-sugar threshold and the 999 note. */
export function emergencyRulesMarkdown(): string {
  const en = mcpTranslator('en');
  const bn = mcpTranslator('bn');
  const lines = ['# Nirapod emergency rules', '', 'NEEDS CLINICIAN REVIEW — from config/danger-signs.ts and config/glucose.ts.', '', `Any one of these signs means: **${en('emergency.alert.title')}** / ${bn('emergency.alert.title')}`, ''];
  for (const g of DANGER_SIGN_GROUPS) for (const id of g.signs) lines.push(`- \`${id}\` — ${signLabel(en, id)} / ${signLabel(bn, id)}. ${en(`emergency.signs.${id}.hint`)}`);
  lines.push('', '## Advice', '', ...(['noteTime', 'sweetIfAwake', 'nothingByMouth'] as const).map((k) => `- ${en(`emergency.advice.${k}`)} / ${bn(`emergency.advice.${k}`)}`));
  lines.push('', '## Low blood sugar (safety rule 6)', '', `Below ${LOW_GLUCOSE_DANGER_BELOW_MMOL} mmol/L (${MGDL_THRESHOLD} mg/dL): ${en('diabetes.lowSugarBody')} Never suggest reducing food.`);
  lines.push('', '## 999', '', en('emergency.about999'), bn('emergency.about999'), '', `Checklist ids: ${DANGER_SIGN_IDS.join(', ')}.`);
  return lines.join('\n');
}
