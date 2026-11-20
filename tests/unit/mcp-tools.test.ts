/**
 * Nirapod MCP tools on the real read-only datasets (data/build/*.sqlite; run `npm run build:data` first),
 * plus the MCP server itself through an in-memory MCP client.
 */
import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { SAFETY_RULES, safetyRulesMarkdown } from '@/lib/mcp/safety-rules';
import { createNirapodMcpServer, SAFETY_RULES_URI, TOOL_NAMES } from '@/lib/mcp/server';
import { NOTES, assertSafe, checkDuplicates, checkExpiry, cheaperAlternatives, foodCarbs, searchMedicine } from '@/lib/mcp/tools';

const MED = 'data/build/medicines.sqlite';
const NUT = 'data/build/nutrition.sqlite';
if (!existsSync(MED) || !existsSync(NUT)) throw new Error('MCP tests need the datasets: run `npm run build:data` first.');
const med = new Database(MED, { readonly: true, fileMustExist: true });
const nut = new Database(NUT, { readonly: true, fileMustExist: true });
const TODAY = new Date(2026, 10, 20);
const safe = (x: unknown) => assertSafe(JSON.stringify(x));

describe('search_medicine', () => {
  it('Napa → paracetamol, tablets first, with price and the price note', () => {
    const r = searchMedicine(med, 'Napa', 5);
    expect(r.found).toBe(true);
    expect(r.results[0]).toMatchObject({ brand: 'Napa', generic: 'Paracetamol', dosage_form: 'Tablet', manufacturer: 'Beximco Pharmaceuticals Ltd.' });
    expect(r.results[0]!.price.unit_price_bdt).toBeGreaterThan(0);
    expect(r.note).toBe('Prices are from the dataset snapshot and may be out of date.');
    expect(r.dataset.prices_as_of).toBe('2021-09');
    safe(r);
  });
  it('Bangla script: নাপা → Napa', () => {
    expect(searchMedicine(med, 'নাপা', 3).results[0]).toMatchObject({ brand: 'Napa', generic: 'Paracetamol' });
  });
  it('generic names and typos: omeprazole, metformin, "Secl0"', () => {
    expect(searchMedicine(med, 'omeprazole', 3).results.every((x) => x.generic === 'Omeprazole')).toBe(true);
    expect(searchMedicine(med, 'metformin', 3).results.every((x) => /metformin/i.test(x.generic ?? ''))).toBe(true);
    expect(searchMedicine(med, 'Secl0', 1).results[0]?.brand).toBe('Seclo');
  });
  it('limit is respected and capped; unknown names say so', () => {
    expect(searchMedicine(med, 'Napa', 2).results).toHaveLength(2);
    expect(searchMedicine(med, 'Napa', 500).results.length).toBeLessThanOrEqual(20);
    expect(searchMedicine(med, 'Zyxorinab', 3)).toMatchObject({ found: false, results: [] });
  });
});

describe('find_cheaper_alternatives (rule 10)', () => {
  it('Seclo 20 mg capsule → only omeprazole 20 mg capsules, cheapest first, with the pharmacist note', () => {
    const r = cheaperAlternatives(med, 'Seclo');
    expect(r.found).toBe(true);
    expect(r.medicine).toMatchObject({ brand: 'Seclo', generic: 'Omeprazole', strength: '20mg', dosage_form: 'Capsule' });
    const alts = r.alternatives ?? [];
    expect(alts.length).toBeGreaterThan(3);
    for (const a of alts) expect([a.generic, a.strength.replace(/\s/g, ''), a.dosage_form]).toEqual(['Omeprazole', '20mg', 'Capsule']);
    const prices = alts.map((a) => a.price.unit_price_bdt!);
    expect(prices).toEqual([...prices].sort((x, y) => x - y));
    expect(r.note).toBe('Confirm with your pharmacist before switching.');
    safe(r);
  });
  it('Napa 500 mg tablet → paracetamol 500 mg tablets only; a strength can be chosen', () => {
    const r = cheaperAlternatives(med, 'Napa', '500mg', 'Tablet');
    expect(r.medicine).toMatchObject({ strength: '500mg', dosage_form: 'Tablet' });
    for (const a of r.alternatives ?? []) expect([a.generic, a.strength.replace(/\s/g, ''), a.dosage_form]).toEqual(['Paracetamol', '500mg', 'Tablet']);
  });
  it('unknown brand', () => {
    expect(cheaperAlternatives(med, 'Zyxorinab')).toMatchObject({ found: false, note: NOTES.pharmacist });
  });
});

describe('check_duplicate_generics', () => {
  it('two metformin brands, and Napa + Ace (paracetamol twice); Seclo is not flagged', () => {
    const r = checkDuplicates(med, ['Comet', 'Daomin', 'Napa', 'Ace', 'Seclo']);
    expect(r.duplicates).toContainEqual({ generic: 'metformin', brands: ['Comet', 'Daomin'] });
    expect(r.duplicates).toContainEqual({ generic: 'paracetamol', brands: ['Napa', 'Ace'] });
    expect(r.duplicates.some((d) => d.brands.includes('Seclo'))).toBe(false);
    expect(r.note).toBe('Ask your doctor or pharmacist; do not stop on your own.');
    safe(r);
  });
  it('no duplicates, and names not in the dataset are reported, not guessed', () => {
    const r = checkDuplicates(med, ['Napa', 'Seclo', 'Zyxorinab']);
    expect(r.duplicates).toEqual([]);
    expect(r.checked.find((c) => c.name === 'Zyxorinab')).toMatchObject({ in_dataset: false, matched_brand: null });
  });
});

describe('get_food_carbs (FoodNetBD, CC BY 4.0)', () => {
  it('rice → the boiled rice the app uses, with source and licence', () => {
    const r = foodCarbs(nut, 'rice');
    expect(r.results[0]).toMatchObject({ name_en: 'Boiled Rice BR-28', carbs_g_per_100g: 24.3 });
    expect(r.source).toMatchObject({ licence: 'CC BY 4.0', url: 'https://data.mendeley.com/datasets/23f7yxnvy7/1' });
    expect(r.source.name).toMatch(/FoodNetBD/);
  });
  it('Bangla and app food names: রুটি, ruti, daal', () => {
    expect(foodCarbs(nut, 'রুটি').results[0]?.name_en).toMatch(/Roti/);
    expect(foodCarbs(nut, 'ruti').results[0]?.name_en).toBe('Roti (Ruti)');
    expect(foodCarbs(nut, 'daal').results[0]?.name_en).toMatch(/Dal/);
    expect(foodCarbs(nut, 'zzzz')).toMatchObject({ found: false, results: [] });
  });
});

describe('check_expiry (the app parser: EXP vs MFG)', () => {
  it.each([
    ['EXP 08/2027', 'ok', '08/2027'],
    ['EXP: AUG 27', 'ok', '08/2027'],
    ['31.08.2027', 'ok', '31/08/2027'],
    ['মেয়াদ: ০৮/২০২৭', 'ok', '08/2027'],
    ['MFG 03/2025 EXP 12/2026', 'expiring_soon', '12/2026'],
    ['EXP 10/2026', 'expired', '10/2026'],
    ['MFG 03/2025', 'not_readable', null],
    ['EXP 13/2027', 'not_readable', null],
    ['Napa 500 mg', 'not_readable', null],
  ])('%s → %s', (text, status, exp) => {
    const r = checkExpiry(text, TODAY);
    expect(r.status).toBe(status);
    expect(r.expiry).toBe(exp);
  });
  it('an MFG date is reported separately, never as the expiry', () => {
    expect(checkExpiry('MFG 03/2025 EXP 02/2028', TODAY)).toMatchObject({ manufactured: '03/2025', expiry: '02/2028' });
  });
});

describe('safety', () => {
  it('assertSafe rejects verdicts, dose advice and diagnoses', () => {
    expect(() => assertSafe('This pack looks genuine')).toThrow();
    expect(() => assertSafe('It may be fake')).toThrow();
    expect(() => assertSafe('Increase your dose to two tablets')).toThrow();
    expect(() => assertSafe('You have diabetes')).toThrow();
    expect(assertSafe('Confirm with your pharmacist before switching.')).toBeTruthy();
  });
  it('the 12 safety rules are served in full', () => {
    expect(SAFETY_RULES).toHaveLength(12);
    expect(safetyRulesMarkdown()).toMatch(/^# Nirapod safety rules/);
    expect(safetyRulesMarkdown()).toContain('12. Clinical thresholds live in config/');
  });
});

describe('MCP server (in-memory client)', () => {
  const client = new Client({ name: 'nirapod-test', version: '1.0.0' });
  beforeAll(async () => {
    const server = createNirapodMcpServer({ medicines: med, nutrition: nut, today: () => TODAY });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(a), client.connect(b)]);
  });
  afterAll(() => client.close());

  it('lists exactly the five read-only tools with JSON input schemas', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...TOOL_NAMES].sort());
    for (const t of tools) {
      expect(t.description!.length).toBeGreaterThan(60);
      expect(t.inputSchema.type).toBe('object');
      expect(t.annotations?.readOnlyHint).toBe(true);
    }
    const search = tools.find((t) => t.name === 'search_medicine')!;
    expect(search.inputSchema.required).toEqual(['query']);
  });

  it('calls each tool', async () => {
    const call = async (name: string, args: Record<string, unknown>) => {
      const r = await client.callTool({ name, arguments: args });
      expect(r.isError).toBeFalsy();
      return JSON.parse((r.content as Array<{ text: string }>)[0]!.text);
    };
    expect((await call('search_medicine', { query: 'নাপা', limit: 1 })).results[0].brand).toBe('Napa');
    expect((await call('find_cheaper_alternatives', { brand: 'Seclo' })).note).toBe('Confirm with your pharmacist before switching.');
    expect((await call('check_duplicate_generics', { medicines: ['Comet', 'Daomin'] })).duplicates[0].generic).toBe('metformin');
    expect((await call('get_food_carbs', { food: 'rice' })).source.licence).toBe('CC BY 4.0');
    expect((await call('check_expiry', { date_text: 'EXP 08/2027' })).status).toBe('ok');
  });

  it('rejects over-long input (limits) without running the tool', async () => {
    const r = await client.callTool({ name: 'search_medicine', arguments: { query: 'x'.repeat(500) } });
    expect(r.isError).toBe(true);
  });

  it('serves nirapod://safety-rules', async () => {
    const { resources } = await client.listResources();
    expect(resources.map((r) => r.uri)).toContain(SAFETY_RULES_URI);
    const r = await client.readResource({ uri: SAFETY_RULES_URI });
    expect((r.contents[0] as { text: string }).text).toContain('Never call a medicine fake or genuine');
  });
});
