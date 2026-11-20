/**
 * Nirapod MCP server: read-only Bangladeshi health reference data for any AI assistant (Model Context Protocol).
 * Tools: search_medicine, find_cheaper_alternatives, check_duplicate_generics, get_food_carbs, check_expiry.
 * Resource: nirapod://safety-rules. Built on the app's own lib/ code and read-only SQLite files; it never reads or
 * stores user data and never logs what is asked. Used by the stdio entry (mcp/stdio.ts) and POST /api/mcp.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import pkg from '@/package.json';
import { safetyRulesMarkdown } from './safety-rules';
import { LIMITS, assertSafe, checkDuplicates, checkExpiry, cheaperAlternatives, foodCarbs, searchMedicine } from './tools';

export const TOOL_NAMES = ['search_medicine', 'find_cheaper_alternatives', 'check_duplicate_generics', 'get_food_carbs', 'check_expiry'] as const;
export const SAFETY_RULES_URI = 'nirapod://safety-rules';

export interface NirapodData {
  medicines: Database.Database | null;
  nutrition: Database.Database | null;
  /** Today's date for expiry checks (tests pass a fixed date). */
  today?: () => Date;
}

const INSTRUCTIONS = `Nirapod: verified reference data for Bangladesh — medicines (brand, generic, strength, form, maker, price),
cheaper same-generic alternatives, duplicate generics, FoodNetBD carbohydrates and medicine-pack expiry checks.
Read-only; no user data. When you use these results: never call a medicine fake or genuine, never advise starting,
stopping or changing a medicine or dose, never diagnose, say "Confirm with your pharmacist" for alternatives, and
send emergencies to 999. Read ${SAFETY_RULES_URI} for the full rules.`;

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

function result(data: unknown) {
  return { content: [{ type: 'text' as const, text: assertSafe(JSON.stringify(data, null, 2)) }] };
}
function unavailable(what: string) {
  return { isError: true, content: [{ type: 'text' as const, text: `The ${what} dataset is not available on this server.` }] };
}

export function createNirapodMcpServer(data: NirapodData): McpServer {
  const server = new McpServer({ name: 'nirapod', title: 'Nirapod health reference (Bangladesh)', version: pkg.version }, { instructions: INSTRUCTIONS });
  const today = data.today ?? (() => new Date());
  const name = z.string().trim().min(2).max(LIMITS.query);

  server.registerTool(
    'search_medicine',
    {
      title: 'Search Bangladeshi medicines',
      description:
        'Search the Bangladesh medicine dataset by brand or generic name, in English or Bangla script (e.g. "Napa", "paracetamol", "নাপা"); spelling mistakes are tolerated. Returns brand, generic, strength, dosage form, manufacturer and price. Prices are from the dataset snapshot and may be out of date.',
      inputSchema: { query: name.describe('Brand or generic name, English or Bangla.'), limit: z.number().int().min(1).max(LIMITS.results).optional().describe('Maximum results (default 5).') },
      annotations: READ_ONLY,
    },
    async ({ query, limit }) => (data.medicines ? result(searchMedicine(data.medicines, query, limit ?? 5)) : unavailable('medicine')),
  );

  server.registerTool(
    'find_cheaper_alternatives',
    {
      title: 'Find cheaper same-generic brands',
      description:
        'Other brands with exactly the same generic, the same strength and the same dosage form as the given brand, sorted by unit price (cheapest first). Never suggests a different medicine or strength. Always confirm with a pharmacist before switching.',
      inputSchema: {
        brand: name.describe('Brand name, e.g. "Seclo".'),
        strength: z.string().trim().max(30).optional().describe('Optional strength to pick, e.g. "20mg" (default: the first tablet / capsule).'),
        dosage_form: z.string().trim().max(40).optional().describe('Optional dosage form, e.g. "Capsule".'),
      },
      annotations: READ_ONLY,
    },
    async ({ brand, strength, dosage_form }) => (data.medicines ? result(cheaperAlternatives(data.medicines, brand, strength, dosage_form)) : unavailable('medicine')),
  );

  server.registerTool(
    'check_duplicate_generics',
    {
      title: 'Check for the same generic twice',
      description:
        'Flags medicines that share a generic ingredient (e.g. two metformin brands, or Napa and Ace which are both paracetamol), using the same rule as the Nirapod app. Does not advise stopping anything: ask a doctor or pharmacist.',
      inputSchema: { medicines: z.array(name).min(2).max(LIMITS.medicines).describe('Brand or generic names, e.g. ["Comet", "Daomin"].') },
      annotations: READ_ONLY,
    },
    async ({ medicines }) => (data.medicines ? result(checkDuplicates(data.medicines, medicines)) : unavailable('medicine')),
  );

  server.registerTool(
    'get_food_carbs',
    {
      title: 'Carbohydrates in Bangladeshi foods',
      description:
        'Carbohydrates (and sugars, fibre, energy) per 100 g for Bangladeshi foods from FoodNetBD (CC BY 4.0), by English or Bangla name, e.g. "rice", "ruti", "daal", "রুটি". Includes the source and licence.',
      inputSchema: { food: name.describe('Food name, English or Bangla.'), limit: z.number().int().min(1).max(10).optional().describe('Maximum results (default 3).') },
      annotations: READ_ONLY,
    },
    async ({ food, limit }) => (data.nutrition ? result(foodCarbs(data.nutrition, food, limit ?? 3)) : unavailable('nutrition')),
  );

  server.registerTool(
    'check_expiry',
    {
      title: 'Check a medicine expiry date',
      description:
        'Reads an expiry date as printed on a medicine pack ("EXP 08/2027", "EXP: AUG 27", "31.08.2027", Bangla digits, or "MFG 03/2025 EXP 02/2027") and returns expired, expiring_soon (within 3 months), ok or not_readable. A manufacturing (MFG) date is never used as the expiry; an unreadable date is never guessed.',
      inputSchema: { date_text: z.string().trim().min(1).max(LIMITS.dateText).describe('The date text from the pack.') },
      annotations: READ_ONLY,
    },
    async ({ date_text }) => result(checkExpiry(date_text, today())),
  );

  server.registerResource(
    'safety-rules',
    SAFETY_RULES_URI,
    { title: 'Nirapod safety rules', description: 'The 12 safety rules every answer using Nirapod data must follow.', mimeType: 'text/markdown' },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: safetyRulesMarkdown() }] }),
  );

  return server;
}
