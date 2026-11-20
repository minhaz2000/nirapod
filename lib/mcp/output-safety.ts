/**
 * Output check for the Nirapod Emergency and Lab Report MCP servers: every answer is checked against the safety
 * rules before it is sent. Bans "you have …" (rule 1), "fake" / "genuine" (rule 2), dose-change wording (rule 3,
 * the same patterns as the explanation validator) and any advice to eat less (rule 6). Throws on a violation, so
 * a bad answer is never returned.
 */
import { DIAGNOSIS, DOSE_ADVICE, SAFE_PHRASES } from '@/lib/explain/validate';

const BANNED: Array<[string, RegExp]> = [
  ['diagnosis', /\byou (?:have|are suffering from)\b/i],
  ['authenticity', /\b(?:fake|genuine|counterfeit)\b|নকল|ভেজাল|আসল ওষুধ/i],
  ['reduce food', /\b(?:reduce|cut down on|skip)\s+(?:your\s+)?(?:food|meals?|eating|carbs?)\b|\beat\s+less\b|কম\s*খান|খাবার\s*কম/i],
];

export function outputViolation(text: string): string | null {
  for (const [name, re] of BANNED) if (re.test(text)) return name;
  if (DIAGNOSIS.some((re) => re.test(text))) return 'diagnosis';
  const withoutSafe = SAFE_PHRASES.reduce((acc, re) => acc.replace(re, ' '), text);
  if (DOSE_ADVICE.some((re) => re.test(withoutSafe))) return 'dose change';
  return null;
}

export function assertSafeOutput(text: string): string {
  const v = outputViolation(text);
  if (v) throw new Error(`unsafe output (${v})`);
  return text;
}
