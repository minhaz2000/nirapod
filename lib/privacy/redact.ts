/**
 * Removes personal identifiers before ANY server call (safety rule 9).
 *
 * Text: Bangladeshi mobile numbers (English or Bangla digits), e-mail addresses, NID-like digit runs, titled names
 * (Mr./Mrs./Md./Mst./Dr. …), and labelled name / phone / address / ID fields. Medicine lines are left alone.
 * Images: the header strip of a prescription (patient name, phone, address, doctor's chamber details) is CROPPED
 * off — not blurred — so nothing of it is sent. See cropRows / headerCropRow; the browser side is redact-canvas.ts.
 */

const D = '[0-9০-৯]';

const PATTERNS: Array<[RegExp, string]> = [
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[EMAIL]'],
  // +8801XXXXXXXXX, 8801XXXXXXXXX, 01XXXXXXXXX — spaces/dashes allowed, English or Bangla digits
  [new RegExp(`(?:\\+?[8৮][8৮][\\s-]?)?[0০][\\s-]?[1১][3-9৩-৯](?:[\\s-]?${D}){8}`, 'g'), '[PHONE]'],
  // NID: 10, 13 or 17 digits
  [new RegExp(`(?<!${D})(?:${D}{17}|${D}{13}|${D}{10})(?!${D})`, 'g'), '[ID]'],
  // Labelled fields, English and Bangla: the rest of the line is removed
  [
    /((?:patient(?:'s)?\s*)?name|pt\.?\s*name|guardian|father(?:'s)?\s*name|husband(?:'s)?\s*name|address|addr\.?|vill(?:age)?\.?|mobile|phone|cell|contact|patient\s*id|nid|রোগীর নাম|নাম|ঠিকানা|গ্রাম|মোবাইল|ফোন)\s*(?:no\.?|নং)?\s*[:：-]\s*[^\n]+/gi,
    '$1: [REDACTED]',
  ],
  // Titled personal names: "Mrs. Rahima Begum", "Md. Karim Uddin", "Dr. A. Karim"
  [/\b(?:Mr|Mrs|Ms|Miss|Md|Mst|Mohammad|Mohammed|Dr|Prof)\.?\s+[A-Z][a-z]*\.?(?:\s+[A-Z][a-z]*\.?){0,3}/g, '[NAME]'],
  [/(জনাব|জনাবা|মোঃ|মোসাঃ|ডাঃ|ডা\.)\s*[ঀ-৿]+(?:\s+[ঀ-৿]+){0,3}/g, '[NAME]'],
];

export function redact(text: string): string {
  return PATTERNS.reduce((acc, [re, replacement]) => acc.replace(re, replacement), text).replace(/[ \t]{2,}/g, ' ');
}

/** Default share of a prescription photo (from the top) treated as the header and cropped off before upload. */
export const DEFAULT_HEADER_FRACTION = 0.25;

/** First row kept after cropping the header, clamped so at least 20% of the image is kept. */
export function headerCropRow(height: number, fraction: number = DEFAULT_HEADER_FRACTION): number {
  const f = Math.min(0.8, Math.max(0, Number.isFinite(fraction) ? fraction : DEFAULT_HEADER_FRACTION));
  return Math.round(height * f);
}

/** Pure crop of an RGBA buffer: keeps rows [fromRow, height). Returns the new buffer and height. */
export function cropRows(rgba: Uint8ClampedArray, width: number, height: number, fromRow: number) {
  const start = Math.min(height, Math.max(0, fromRow));
  const newHeight = height - start;
  return { data: rgba.slice(start * width * 4, height * width * 4), width, height: newHeight };
}
