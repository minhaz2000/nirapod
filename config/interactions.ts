/**
 * NEEDS PHARMACIST REVIEW — a small, curated list of medicine combinations that may be harmful together.
 *
 * Matching is by ingredient name contained in the generic name from the medicine database (e.g. "warfarin" matches
 * "Warfarin Sodium"). This list is deliberately short and is NOT a complete interaction checker: "no warning" does
 * not mean a combination is safe. User-facing wording is in messages/{bn,en}.json under
 * medicine.explain.interactions.<id>, and never tells anyone to stop or change a medicine (rule 3).
 */
export type InteractionSeverity = 'avoid' | 'caution';

export interface InteractionRule {
  id: string;
  severity: InteractionSeverity;
  /** Pair rule: any ingredient from `a` together with any from `b`. */
  a?: readonly string[];
  b?: readonly string[];
  /** Group rule: two DIFFERENT ingredients from the same group. */
  group?: readonly string[];
}

export const NSAIDS = [
  'ibuprofen', 'naproxen', 'diclofenac', 'aceclofenac', 'ketorolac', 'etoricoxib', 'celecoxib', 'indomethacin',
  'mefenamic acid', 'piroxicam', 'meloxicam', 'tenoxicam', 'ketoprofen', 'flurbiprofen', 'nabumetone', 'lornoxicam',
] as const;
const ANTICOAGULANTS = ['warfarin', 'apixaban', 'rivaroxaban', 'dabigatran', 'acenocoumarol'] as const;
const NITRATES = ['nitroglycerin', 'glyceryl trinitrate', 'isosorbide mononitrate', 'isosorbide dinitrate', 'nicorandil'] as const;
const ACE_ARB = [
  'losartan', 'valsartan', 'telmisartan', 'olmesartan', 'irbesartan', 'candesartan', 'azilsartan',
  'enalapril', 'lisinopril', 'ramipril', 'captopril', 'perindopril',
] as const;
const SSRIS = ['sertraline', 'fluoxetine', 'escitalopram', 'citalopram', 'paroxetine', 'fluvoxamine'] as const;

export const INTERACTIONS: readonly InteractionRule[] = [
  { id: 'anticoagulantNsaid', severity: 'avoid', a: ANTICOAGULANTS, b: [...NSAIDS, 'aspirin'] },
  { id: 'twoNsaids', severity: 'caution', group: NSAIDS },
  { id: 'clopidogrelPpi', severity: 'caution', a: ['clopidogrel'], b: ['omeprazole', 'esomeprazole'] },
  { id: 'pde5Nitrate', severity: 'avoid', a: ['sildenafil', 'tadalafil', 'vardenafil'], b: NITRATES },
  { id: 'methotrexateCotrimoxazole', severity: 'avoid', a: ['methotrexate'], b: ['trimethoprim', 'sulfamethoxazole', 'cotrimoxazole'] },
  { id: 'statinMacrolide', severity: 'caution', a: ['simvastatin', 'atorvastatin', 'lovastatin'], b: ['clarithromycin', 'erythromycin'] },
  { id: 'potassiumRaising', severity: 'caution', a: ['spironolactone', 'eplerenone', 'amiloride'], b: ACE_ARB },
  { id: 'tramadolSsri', severity: 'caution', a: ['tramadol'], b: SSRIS },
  {
    id: 'quinoloneMinerals',
    severity: 'caution',
    a: ['ciprofloxacin', 'levofloxacin', 'moxifloxacin', 'ofloxacin'],
    b: ['calcium carbonate', 'ferrous', 'iron', 'zinc', 'magnesium hydroxide', 'aluminium hydroxide', 'aluminum hydroxide'],
  },
];
