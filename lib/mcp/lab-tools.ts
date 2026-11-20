/**
 * Nirapod Lab Report MCP tools as plain functions, built only on the app's rules: lib/rules/report-ranges.ts with
 * the fallback ranges in config/report-ranges.ts (needs clinician review) and the report name / unit normalisers in
 * lib/ocr/report.ts. Bangla test names come from config/lab-test-names-bn.ts. Answers say "may" / "possible",
 * never a diagnosis (rule 1) and never advice to change a medicine (rule 3).
 */
import { LAB_TEST_NAMES_BN } from '@/config/lab-test-names-bn';
import { FALLBACK_RANGES } from '@/config/report-ranges';
import { canonicalTestKey } from '@/lib/ocr/report';
import { checkValue, rangeText } from '@/lib/rules/report-ranges';
import bnMessages from '@/messages/bn.json';
import enMessages from '@/messages/en.json';
import { mcpTranslator, pickLanguage, type McpLanguage } from './i18n';
import { assertSafeOutput } from './output-safety';

const bnKey = (s: string) => s.normalize('NFC').replace(/[\s\p{P}‌‍]+/gu, '');
const BN_ALIASES = Object.entries(LAB_TEST_NAMES_BN)
  .flatMap(([key, names]) => names.map((n) => ({ alias: bnKey(n), key })))
  .sort((a, b) => b.alias.length - a.alias.length);

/** Canonical test key from an English report name (the app's aliases) or a Bangla name. */
export function resolveTestKey(name: string): string | null {
  const en = canonicalTestKey(name);
  if (en) return en;
  const k = bnKey(name);
  if (!k) return null;
  return (BN_ALIASES.find((a) => a.alias === k) ?? BN_ALIASES.find((a) => a.alias.length >= 3 && k.includes(a.alias)))?.key ?? null;
}

export const RANGE_SOURCE = 'Nirapod fallback adult reference range (config/report-ranges.ts), needs clinician review; the range printed on the report wins.';

const unitsFor = (key: string) => FALLBACK_RANGES.filter((r) => r.key === key).map((r) => r.unit);

/** explain_lab_value: low / normal / high with the range used and a plain "may" explanation. */
export function explainLabValue(input: { test_name: string; value: number; unit: string; language?: McpLanguage }) {
  const lang = pickLanguage(input.language, input.test_name);
  const t = mcpTranslator(lang);
  const key = resolveTestKey(input.test_name);
  if (!key) {
    return { test_name: input.test_name, recognised: false, status: 'unknown' as const, language: lang, answer: assertSafeOutput(t('mcp.lab.unknownTest', { name: input.test_name })) };
  }
  const c = checkValue({ name: input.test_name, key, value: input.value, unit: input.unit, range: null, rangeNote: null, printedFlag: null });
  if (c.rangeSource !== 'fallback' || !c.usedRange) {
    return {
      test_name: input.test_name,
      test_key: key,
      recognised: true,
      status: 'unknown' as const,
      supported_units: unitsFor(key),
      language: lang,
      answer: assertSafeOutput(t('mcp.lab.noRange', { test: input.test_name, unit: input.unit || '—', units: unitsFor(key).join(', ') })),
    };
  }
  const range = rangeText(c)!;
  const lines: string[] = [];
  if (c.lowGlucoseEmergency) lines.push(t('mcp.lab.lowGlucose')); // rule 6: first
  lines.push(t('mcp.lab.value', { test: input.test_name, value: input.value, unit: input.unit, status: c.status, range: `${range} ${input.unit}` }));
  const meaningKey = `mcp.lab.meaning.${key}.${c.status}`;
  const hasMeaning = c.status !== 'normal' && Boolean(mcpMessageExists(lang, meaningKey));
  if (hasMeaning) lines.push(t(meaningKey));
  else if (c.status === 'normal') lines.push(t('mcp.lab.normal'));
  lines.push(t('mcp.lab.printedWins'), t('mcp.lab.closing'));
  return {
    test_name: input.test_name,
    test_key: key,
    recognised: true,
    value: input.value,
    unit: input.unit,
    status: c.status as 'low' | 'normal' | 'high',
    range_used: { ...c.usedRange, unit: input.unit, text: range },
    range_source: RANGE_SOURCE,
    low_sugar_emergency: c.lowGlucoseEmergency,
    language: lang,
    answer: assertSafeOutput(lines.join('\n')),
  };
}

function mcpMessageExists(lang: McpLanguage, path: string): boolean {
  let node: unknown = lang === 'bn' ? bnMessages : enMessages;
  for (const part of path.split('.')) node = (node as Record<string, unknown> | undefined)?.[part];
  return typeof node === 'string';
}

/** list_supported_tests: every test, its names (English and Bangla), units and ranges, and the source. */
export function listSupportedTests() {
  const keys = [...new Set(FALLBACK_RANGES.map((r) => r.key))];
  return {
    tests: keys.map((key) => {
      const rows = FALLBACK_RANGES.filter((r) => r.key === key);
      return {
        key,
        names: rows[0]!.names,
        names_bn: LAB_TEST_NAMES_BN[key] ?? [],
        units: rows.map((r) => ({ unit: r.unit, low: r.low ?? null, high: r.high ?? null })),
        source: RANGE_SOURCE,
      };
    }),
    note: 'Ranges are typical adult ranges and ignore sex, age and pregnancy. Needs clinician review.',
  };
}

/** nirapod://lab-ranges */
export function labRangesMarkdown(): string {
  const lines = ['# Nirapod lab reference ranges', '', '**NEEDS CLINICIAN REVIEW.** Fallback adult ranges from config/report-ranges.ts, used only when a report does not print its own range (the printed range always wins). They ignore sex, age and pregnancy.', '', '| Test | Names | Unit | Low | High |', '|---|---|---|---|---|'];
  for (const r of FALLBACK_RANGES) lines.push(`| ${r.key} | ${[...r.names.slice(0, 4), ...(LAB_TEST_NAMES_BN[r.key] ?? []).slice(0, 2)].join(', ')} | ${r.unit} | ${r.low ?? '—'} | ${r.high ?? '—'} |`);
  return lines.join('\n');
}

