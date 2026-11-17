/**
 * Drug registration number (DGDA), e.g. "DAR No.: 123-0045-067", "D.A.R. No. 345-123-456", "Reg. No. 037-0123-045",
 * "Drug Reg. No: 241-0012-031", "নিবন্ধন নং: ১২৩-০০৪৫-০৬৭". Returns it with spaces removed, or null.
 */
import { normaliseOcrText } from './text';

const REG = new RegExp(
  String.raw`(?:\bd\s*\.?\s*a\s*\.?\s*r\s*\.?|\b(?:drug\s*)?reg(?:istration|n|d)?\.?|\bdgda\s*reg\.?|নিবন্ধন|রেজিঃ?)` +
    String.raw`\s*(?:no|number|নং|নম্বর)?[\s.:#\-]*(?<code>\d[\d\s\-\/]{4,20}\d)`,
  'i',
);

export function parseRegistration(raw: string): string | null {
  const text = normaliseOcrText(raw);
  for (const line of text.split('\n')) {
    const code = line.match(REG)?.groups?.code;
    if (code) return code.replace(/\s+/g, '').replace(/-{2,}/g, '-');
  }
  return null;
}
