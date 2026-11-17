/** Shared text clean-up for OCR parsers. */

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';

/** Bangla digits → ASCII digits ("০৫/২০২৪" → "05/2024"). */
export function toAsciiDigits(s: string): string {
  return s.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));
}

/** Normalises OCR output: ASCII digits, straight quotes, unified colons/dashes, collapsed spaces per line. */
export function normaliseOcrText(raw: string): string {
  return toAsciiDigits(raw)
    .replace(/[‘’`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[：﹕]/g, ':')
    .replace(/[–—−]/g, '-')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .join('\n');
}
