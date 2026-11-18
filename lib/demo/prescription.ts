/**
 * Demo mode only: the lines written on public/samples/prescription.png, used when handwriting reading is not
 * available so the confirm-every-line step can still be shown on stage. They are labelled as sample lines in the UI
 * and must be confirmed one by one, like a real reading (rule 7). The names on the sample image are fictional.
 */
import type { HandwritingItem } from '@/app/api/handwriting/route';

export const DEMO_DIAGNOSIS = 'Type 2 DM, Dyslipidaemia';

export const DEMO_PRESCRIPTION_LINES: readonly HandwritingItem[] = [
  { medicine: 'Comet', strength: '500 mg', frequency: '1+0+1', duration: '30 days', diagnosis_if_written: DEMO_DIAGNOSIS, confidence: 0.93 },
  { medicine: 'Rosuva', strength: '10 mg', frequency: '0+0+1', duration: '30 days', diagnosis_if_written: DEMO_DIAGNOSIS, confidence: 0.88 },
  { medicine: 'Clopid', strength: '75 mg', frequency: '0+1+0', duration: '30 days', diagnosis_if_written: '', confidence: 0.81 },
  { medicine: 'Seclo', strength: '20 mg', frequency: '1+0+1', duration: '14 days', diagnosis_if_written: '', confidence: 0.9 },
  { medicine: 'Napa', strength: '500 mg', frequency: '1+1+1', duration: '5 days', diagnosis_if_written: '', confidence: 0.95 },
  { medicine: 'Ace', strength: '500 mg', frequency: '1+0+1', duration: '5 days', diagnosis_if_written: '', confidence: 0.58 },
];
