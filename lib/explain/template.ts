/**
 * The template explanation: built only from the structured input, with fixed wording from messages/{bn,en}.json.
 * Always available (no AI), and the fallback whenever the AI text fails validation.
 */
import type { ExplainInput } from './input';

/** Translator for the 'medicine.explain' namespace (next-intl createTranslator / useTranslations). */
export type ExplainT = (key: string, values?: Record<string, string | number>) => string;

const list = (items: readonly string[]) => items.join(', ');

export function findingText(t: ExplainT, f: ExplainInput['findings'][number]): string {
  switch (f.code) {
    case 'duplicateIngredient':
      return t('findings.duplicateIngredient', { brands: list(f.brands), ingredient: f.ingredient });
    case 'interaction':
      return t('findings.interaction', { a: f.brands[0], b: f.brands[1], text: t(`interactions.${f.id}`) });
    case 'allergy':
      return t('findings.allergy', { brand: f.brand, allergy: f.allergy });
    case 'pregnancy':
      return t('findings.pregnancy', { brand: f.brand, category: f.category });
    case 'notInDatabase':
      return t('findings.notInDatabase', { brand: f.brand });
  }
}

export function relationText(t: ExplainT, r: ExplainInput['relations'][number]): string {
  if (r.kind === 'noLinkedMedicine') return t('relations.noLinkedMedicine', { test: r.test, status: r.status });
  return t(`relations.${r.kind}`, { test: r.test, status: r.status, brands: list(r.brands), effect: r.effect });
}

export function buildTemplate(input: ExplainInput, t: ExplainT): string[] {
  const lines: string[] = [];
  if (input.doctorDiagnosis) lines.push(t('template.diagnosis', { diagnosis: input.doctorDiagnosis }));
  if (input.lowGlucoseEmergency) lines.push(t('template.lowGlucose'));

  const out = input.values.filter((v) => v.status === 'high' || v.status === 'low');
  for (const v of out) {
    const base = { test: v.test, value: v.value, unit: v.unit, status: v.status };
    lines.push(v.range ? t('template.valueOut', { ...base, range: v.range, source: v.rangeSource }) : t('template.valueFlag', base));
  }
  if (input.values.length) {
    if (!out.length) lines.push(t('template.noReportIssues'));
    else if (input.values.some((v) => v.status === 'normal')) lines.push(t('template.valuesNormal'));
  }

  for (const m of input.medicines) {
    lines.push(m.generic ? t('template.medicine', { brand: m.brand, generic: m.generic }) : t('template.medicineUnknown', { brand: m.brand }));
  }
  for (const r of input.relations) lines.push(relationText(t, r));
  for (const f of input.findings) if (f.code !== 'notInDatabase') lines.push(findingText(t, f));
  lines.push(t('template.closing'));
  return lines;
}
