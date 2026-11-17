/**
 * Removes personal identifiers before ANY server call (safety rule 9).
 * Current coverage: Bangladeshi mobile numbers, e-mail addresses, NID-like digit runs,
 * and lines labelled with a name/address. TODO: improve name and address detection.
 */
const PATTERNS: Array<[RegExp, string]> = [
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[EMAIL]'],
  // +8801XXXXXXXXX, 8801XXXXXXXXX, 01XXXXXXXXX (with optional spaces/dashes)
  [/(?:\+?88[\s-]?)?0[\s-]?1[3-9](?:[\s-]?\d){8}/g, '[PHONE]'],
  // NID: 10, 13 or 17 digits
  [/\b(?:\d{17}|\d{13}|\d{10})\b/g, '[ID]'],
  // Labelled fields, English and Bangla
  [/((?:patient\s*)?name|address|রোগীর নাম|নাম|ঠিকানা)\s*[:：-]\s*[^\n]+/gi, '$1: [REDACTED]'],
];

export function redact(text: string): string {
  return PATTERNS.reduce((acc, [re, replacement]) => acc.replace(re, replacement), text);
}
