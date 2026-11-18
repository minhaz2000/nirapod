/**
 * NEEDS CLINICIAN REVIEW — fallback adult reference ranges for common lab tests.
 *
 * These are used ONLY when a report does not print its own reference range. The range printed on the report
 * always wins (labs differ). Values are typical adult ranges from common Bangladeshi lab reports and must be
 * reviewed by a clinician; they ignore sex, age and pregnancy, which can change the normal range.
 * A fallback range is applied only when the report's unit matches the unit listed here (no unit conversion).
 */
export interface FallbackRange {
  /** Canonical test key, shared with config/medicine-test-links.ts. */
  key: string;
  /** Names as printed on reports (lower case, compared after removing punctuation). */
  names: string[];
  /** Unit key (see unitKey in lib/ocr/report.ts). */
  unit: string;
  low?: number;
  high?: number;
}

const FASTING_GLUCOSE = ['fasting blood sugar', 'fasting blood glucose', 'fasting plasma glucose', 'fbs', 'fbg', 'fpg', 'blood sugar fasting', 'blood glucose fasting', 'glucose fasting', 'fasting glucose'];
const RANDOM_GLUCOSE = ['random blood sugar', 'random blood glucose', 'rbs', 'rbg', 'blood sugar random', 'blood glucose random', 'glucose random'];
const AFTER_MEAL_GLUCOSE = ['2 hours after breakfast', '2 hrs abf', '2hrs abf', 'blood sugar 2 hours after breakfast', 'post prandial blood sugar', 'ppbs', '2hpp', 'blood glucose 2 hours after meal'];
// 'hbalc' / 'hb alc': OCR commonly reads the 1 in HbA1c as a lower-case L.
const HBA1C = ['hba1c', 'hb a1c', 'hbalc', 'hb alc', 'glycated haemoglobin', 'glycated hemoglobin', 'glycosylated haemoglobin', 'glycosylated hemoglobin'];
const HB = ['haemoglobin', 'hemoglobin', 'hb'];
const CHOL = ['total cholesterol', 'cholesterol total', 'serum cholesterol', 's cholesterol', 'cholesterol'];
const LDL = ['ldl cholesterol', 'ldl', 'ldl c', 'low density lipoprotein'];
const HDL = ['hdl cholesterol', 'hdl', 'hdl c', 'high density lipoprotein'];
const TG = ['triglycerides', 'triglyceride', 'tg', 'serum triglycerides', 's triglyceride'];
const CREAT = ['serum creatinine', 's creatinine', 'creatinine'];
const ALT = ['alt', 'sgpt', 'alt sgpt', 'sgpt alt', 'alanine aminotransferase', 'alanine transaminase'];
const AST = ['ast', 'sgot', 'ast sgot', 'sgot ast', 'aspartate aminotransferase'];
const TSH = ['tsh', 'thyroid stimulating hormone', 's tsh'];
const URIC = ['uric acid', 'serum uric acid', 's uric acid'];
const K = ['potassium', 'serum potassium', 's potassium', 'k'];
const NA = ['sodium', 'serum sodium', 's sodium', 'na'];
const PLT = ['platelet count', 'platelets', 'platelet'];
const WBC = ['wbc', 'total wbc count', 'total count of wbc', 'white blood cells', 'total leucocyte count', 'tc of wbc', 'wbc count'];

export const FALLBACK_RANGES: FallbackRange[] = [
  { key: 'fasting_glucose', names: FASTING_GLUCOSE, unit: 'mmol/l', low: 3.9, high: 5.6 },
  { key: 'fasting_glucose', names: FASTING_GLUCOSE, unit: 'mg/dl', low: 70, high: 100 },
  { key: 'random_glucose', names: RANDOM_GLUCOSE, unit: 'mmol/l', low: 3.9, high: 7.8 },
  { key: 'random_glucose', names: RANDOM_GLUCOSE, unit: 'mg/dl', low: 70, high: 140 },
  { key: 'after_meal_glucose', names: AFTER_MEAL_GLUCOSE, unit: 'mmol/l', low: 3.9, high: 7.8 },
  { key: 'after_meal_glucose', names: AFTER_MEAL_GLUCOSE, unit: 'mg/dl', low: 70, high: 140 },
  { key: 'hba1c', names: HBA1C, unit: '%', low: 4.0, high: 5.6 },
  { key: 'hemoglobin', names: HB, unit: 'g/dl', low: 12.0, high: 17.5 },
  { key: 'total_cholesterol', names: CHOL, unit: 'mmol/l', high: 5.2 },
  { key: 'total_cholesterol', names: CHOL, unit: 'mg/dl', high: 200 },
  { key: 'ldl', names: LDL, unit: 'mmol/l', high: 3.4 },
  { key: 'ldl', names: LDL, unit: 'mg/dl', high: 130 },
  { key: 'hdl', names: HDL, unit: 'mmol/l', low: 1.0 },
  { key: 'hdl', names: HDL, unit: 'mg/dl', low: 40 },
  { key: 'triglycerides', names: TG, unit: 'mmol/l', high: 1.7 },
  { key: 'triglycerides', names: TG, unit: 'mg/dl', high: 150 },
  { key: 'creatinine', names: CREAT, unit: 'mg/dl', low: 0.6, high: 1.3 },
  { key: 'creatinine', names: CREAT, unit: 'umol/l', low: 53, high: 115 },
  { key: 'alt', names: ALT, unit: 'u/l', high: 40 },
  { key: 'ast', names: AST, unit: 'u/l', high: 40 },
  { key: 'tsh', names: TSH, unit: 'miu/l', low: 0.4, high: 4.0 },
  { key: 'uric_acid', names: URIC, unit: 'mg/dl', low: 3.4, high: 7.0 },
  { key: 'potassium', names: K, unit: 'mmol/l', low: 3.5, high: 5.1 },
  { key: 'sodium', names: NA, unit: 'mmol/l', low: 135, high: 145 },
  { key: 'platelets', names: PLT, unit: '10^9/l', low: 150, high: 400 },
  { key: 'platelets', names: PLT, unit: '/cumm', low: 150_000, high: 400_000 },
  { key: 'wbc', names: WBC, unit: '10^9/l', low: 4.0, high: 11.0 },
  { key: 'wbc', names: WBC, unit: '/cumm', low: 4_000, high: 11_000 },
];

/** Glucose test keys: a value below the hypoglycaemia threshold (config/glucose.ts) is an emergency (rule 6). */
export const GLUCOSE_TEST_KEYS = ['fasting_glucose', 'random_glucose', 'after_meal_glucose'] as const;
