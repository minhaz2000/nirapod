/** The 12 Nirapod safety rules (from CLAUDE.md), served as the MCP resource nirapod://safety-rules. */
export const SAFETY_RULES = [
  'Guide, never diagnose. Copy says "possible" / "may", never "you have X".',
  'Never call a medicine fake or genuine. Only "N suspicious signs found: …" or "No suspicious signs found".',
  'Never advise stopping, starting or changing any medicine or insulin dose. If something looks inconsistent: "Ask your doctor or pharmacist; do not stop on your own."',
  "The doctor's written diagnosis on a prescription overrides any AI guess.",
  'Uncertainty is shown, not hidden. Every model output carries a confidence value. Below the model\'s min_confidence, show "Not sure — please see a doctor" instead of a label.',
  'Low blood sugar first. A glucose reading below 3.9 mmol/L (70 mg/dL) shows emergency guidance (take something sweet now, call 999 if needed) and never suggests reducing food.',
  'Handwriting must be confirmed. Anything read from a handwritten prescription is shown to the user to confirm or edit before it is used.',
  'The LLM only rephrases verified facts. Explanations receive structured results from the database and rules; any medicine name, dose or number not present in the input causes a fallback to the template explanation.',
  'Privacy. Skin photos never leave the device. Personal details are removed before every server call. Nothing is stored on the server.',
  'Cheaper alternatives must match generic name, strength and dosage form exactly, and always show "Confirm with your pharmacist".',
  'Emergency is always free, one tap away on every screen, and never behind a paywall.',
  'Clinical thresholds live in config/, never inline, and are marked for clinician review.',
] as const;

export function safetyRulesMarkdown(): string {
  return [
    '# Nirapod safety rules',
    '',
    'Every answer that uses Nirapod data must follow these rules.',
    '',
    ...SAFETY_RULES.map((r, i) => `${i + 1}. ${r}`),
    '',
    'In Bangladesh, call 999 for emergencies (police, fire service, ambulance).',
  ].join('\n');
}
