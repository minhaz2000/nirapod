/**
 * The ONLY input /api/explain accepts: structured, already-checked results (rule 8). No free text from the user
 * other than names/values that came from the report, the confirmed prescription and the doctor's written diagnosis.
 */
import { redact } from '@/lib/privacy/redact';
import type { PrescriptionFinding, Relation } from '@/lib/rules/prescription';

export type ExplainLocale = 'bn' | 'en';

export interface ExplainValue {
  test: string;
  value: number;
  unit: string;
  status: 'high' | 'low' | 'normal' | 'unknown';
  /** Range text as shown, e.g. "3.9 - 5.6" or "< 200"; null when none. */
  range: string | null;
  rangeSource: 'printed' | 'fallback' | 'printed-flag' | 'none';
}

export interface ExplainMedicine {
  brand: string;
  generic: string | null;
  strength: string;
  form: string;
  frequency: string;
  duration: string;
}

export interface ExplainInput {
  locale: ExplainLocale;
  doctorDiagnosis: string | null;
  lowGlucoseEmergency: boolean;
  values: ExplainValue[];
  medicines: ExplainMedicine[];
  findings: PrescriptionFinding[];
  relations: Relation[];
}

const str = (v: unknown, max = 120): string | null => (typeof v === 'string' ? redact(v).trim().slice(0, max) : null);
const arr = (v: unknown, max: number): unknown[] | null => (Array.isArray(v) && v.length <= max ? v : null);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const oneOf = <T extends string>(v: unknown, options: readonly T[]): T | null => (options.includes(v as T) ? (v as T) : null);

/** Validates and sanitises the request body. Returns null if anything is malformed. Every string is redacted (rule 9). */
export function parseExplainInput(body: unknown): ExplainInput | null {
  if (!isObj(body)) return null;
  const locale = oneOf(body.locale, ['bn', 'en'] as const);
  const valuesRaw = arr(body.values ?? [], 60);
  const medsRaw = arr(body.medicines ?? [], 30);
  const findingsRaw = arr(body.findings ?? [], 60);
  const relationsRaw = arr(body.relations ?? [], 60);
  if (!locale || !valuesRaw || !medsRaw || !findingsRaw || !relationsRaw) return null;

  const values: ExplainValue[] = [];
  for (const v of valuesRaw) {
    if (!isObj(v)) return null;
    const test = str(v.test);
    const status = oneOf(v.status, ['high', 'low', 'normal', 'unknown'] as const);
    const rangeSource = oneOf(v.rangeSource, ['printed', 'fallback', 'printed-flag', 'none'] as const);
    if (!test || typeof v.value !== 'number' || !Number.isFinite(v.value) || !status || !rangeSource) return null;
    values.push({ test, value: v.value, unit: str(v.unit, 20) ?? '', status, range: v.range == null ? null : str(v.range, 40), rangeSource });
  }

  const medicines: ExplainMedicine[] = [];
  for (const m of medsRaw) {
    if (!isObj(m)) return null;
    const brand = str(m.brand);
    if (!brand) return null;
    medicines.push({
      brand,
      generic: m.generic == null ? null : str(m.generic),
      strength: str(m.strength, 40) ?? '',
      form: str(m.form, 40) ?? '',
      frequency: str(m.frequency, 40) ?? '',
      duration: str(m.duration, 40) ?? '',
    });
  }
  const brands = new Set(medicines.map((m) => m.brand));
  const tests = new Set(values.map((v) => v.test));
  const knownBrands = (list: unknown) => Array.isArray(list) && list.length > 0 && list.every((b) => typeof b === 'string' && brands.has(redact(b).trim()));

  const findings: PrescriptionFinding[] = [];
  for (const f of findingsRaw) {
    if (!isObj(f)) return null;
    switch (f.code) {
      case 'duplicateIngredient':
        if (knownBrands(f.brands) && str(f.ingredient)) findings.push({ code: f.code, ingredient: str(f.ingredient)!, brands: f.brands as string[] });
        break;
      case 'interaction': {
        const severity = oneOf(f.severity, ['avoid', 'caution'] as const);
        if (severity && typeof f.id === 'string' && /^[a-zA-Z]+$/.test(f.id) && knownBrands(f.brands) && (f.brands as string[]).length === 2) {
          findings.push({ code: f.code, id: f.id, severity, brands: f.brands as [string, string] });
        }
        break;
      }
      case 'allergy':
        if (knownBrands([f.brand]) && str(f.allergy, 60)) findings.push({ code: f.code, brand: f.brand as string, allergy: str(f.allergy, 60)! });
        break;
      case 'pregnancy':
        if (knownBrands([f.brand]) && typeof f.category === 'string' && /^[ABCDX](\+[ABCDX])?$/.test(f.category)) {
          findings.push({ code: f.code, brand: f.brand as string, category: f.category });
        }
        break;
      case 'notInDatabase':
        if (knownBrands([f.brand])) findings.push({ code: f.code, brand: f.brand as string });
        break;
      default:
        return null;
    }
  }

  const relations: Relation[] = [];
  for (const r of relationsRaw) {
    if (!isObj(r)) return null;
    const status = oneOf(r.status, ['high', 'low'] as const);
    const test = str(r.test);
    if (!status || !test || !tests.has(test)) continue;
    if (r.kind === 'noLinkedMedicine') relations.push({ kind: r.kind, test, status });
    else if ((r.kind === 'related' || r.kind === 'doesNotFit') && knownBrands(r.brands)) {
      const effect = oneOf(r.effect, ['lowers', 'raises', 'monitored'] as const);
      if (effect && typeof r.linkId === 'string') relations.push({ kind: r.kind, test, status, brands: r.brands as string[], linkId: r.linkId, effect });
    }
  }

  const doctorDiagnosis = body.doctorDiagnosis == null || body.doctorDiagnosis === '' ? null : str(body.doctorDiagnosis, 200);
  return { locale, doctorDiagnosis, lowGlucoseEmergency: body.lowGlucoseEmergency === true, values, medicines, findings, relations };
}
