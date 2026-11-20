/** Bangla / English text for the MCP servers, from the app's message files (same wording as the app). */
import { createTranslator } from 'next-intl';
import bn from '@/messages/bn.json';
import en from '@/messages/en.json';

export type McpLanguage = 'en' | 'bn';
export type McpT = (key: string, values?: Record<string, string | number>) => string;

const MESSAGES = { bn, en } as const;
export const mcpTranslator = (lang: McpLanguage): McpT => createTranslator({ locale: lang, messages: MESSAGES[lang] }) as unknown as McpT;

/** The language to answer in: as asked, else Bangla when any input is in Bangla script, else English. */
export function pickLanguage(asked: McpLanguage | undefined, ...inputs: unknown[]): McpLanguage {
  if (asked) return asked;
  return inputs.some((i) => /[ঀ-৿]/.test(JSON.stringify(i ?? ''))) ? 'bn' : 'en';
}
