import type { Product } from '@/lib/medicine/repo';

export interface RxLine {
  id: string;
  medicine: string;
  strength: string;
  frequency: string;
  duration: string;
  /** Reading confidence (0–1) from the handwriting reader; null for lines typed by the user. */
  confidence: number | null;
  /** ai = read by the language model; ocr = read on the phone and matched to the medicine list; manual = typed. */
  source: 'ai' | 'demo' | 'manual' | 'ocr';
  /** Rule 7: nothing is used until the user confirms the line. */
  confirmed: boolean;
  /** Database match chosen by the user; null = not matched (not checked). */
  product: Product | null;
}

let counter = 0;
export const newLineId = () => `line-${Date.now().toString(36)}-${++counter}`;
