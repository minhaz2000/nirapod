/** Safety rule 5: below the model's min_confidence, never show a label. */
export type LabelDecision =
  | { kind: 'label'; label: string; confidence: number }
  | { kind: 'not-sure'; confidence: number };

export function decideLabel(label: string, confidence: number, minConfidence: number): LabelDecision {
  return confidence >= minConfidence
    ? { kind: 'label', label, confidence }
    : { kind: 'not-sure', confidence };
}
