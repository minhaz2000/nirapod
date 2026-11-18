/**
 * NEEDS CLINICIAN REVIEW — which medicines are COMMONLY related to which lab values.
 * Used only to explain "this medicine is commonly used for this kind of result" when a report and a prescription
 * are shown together. It is general information, never a diagnosis; the doctor's written diagnosis comes first
 * (rule 4). `effect` is the usual direction: a lowering medicine next to an already LOW value "does not fit" and the
 * app says "Ask your doctor; do not stop on your own" (rule 3).
 */
export type LinkEffect = 'lowers' | 'raises' | 'monitored';

export interface MedicineTestLink {
  id: string;
  ingredients: readonly string[];
  /** Test keys from config/report-ranges.ts. */
  tests: readonly string[];
  effect: LinkEffect;
}

const GLUCOSE_TESTS = ['fasting_glucose', 'random_glucose', 'after_meal_glucose', 'hba1c'] as const;

export const MEDICINE_TEST_LINKS: readonly MedicineTestLink[] = [
  {
    id: 'bloodSugar',
    ingredients: [
      'metformin', 'gliclazide', 'glimepiride', 'glibenclamide', 'glipizide', 'sitagliptin', 'vildagliptin',
      'linagliptin', 'teneligliptin', 'empagliflozin', 'dapagliflozin', 'pioglitazone', 'acarbose', 'insulin',
    ],
    tests: GLUCOSE_TESTS,
    effect: 'lowers',
  },
  {
    id: 'cholesterol',
    ingredients: ['atorvastatin', 'rosuvastatin', 'simvastatin', 'pitavastatin', 'pravastatin', 'fenofibrate', 'ezetimibe'],
    tests: ['total_cholesterol', 'ldl', 'triglycerides'],
    effect: 'lowers',
  },
  {
    id: 'anaemia',
    ingredients: ['ferrous', 'iron', 'folic acid', 'cyanocobalamin', 'methylcobalamin'],
    tests: ['hemoglobin'],
    effect: 'raises',
  },
  { id: 'thyroid', ingredients: ['levothyroxine', 'thyroxine'], tests: ['tsh'], effect: 'lowers' },
  { id: 'uricAcid', ingredients: ['allopurinol', 'febuxostat'], tests: ['uric_acid'], effect: 'lowers' },
  {
    id: 'kidneyPotassium',
    ingredients: ['losartan', 'valsartan', 'telmisartan', 'olmesartan', 'enalapril', 'lisinopril', 'ramipril', 'spironolactone'],
    tests: ['potassium', 'creatinine'],
    effect: 'monitored',
  },
];
