/**
 * Integration: the official MCP TypeScript client connects to the Nirapod MCP server over BOTH transports —
 * stdio (`npm run --silent mcp`, a child process) and stateless Streamable HTTP (POST /api/mcp on the production
 * build) — lists the tools and resources and calls every tool.
 */
import { expect, test } from '@playwright/test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

const TOOLS = ['check_duplicate_generics', 'check_expiry', 'find_cheaper_alternatives', 'get_food_carbs', 'search_medicine'];

async function exercise(transport: Transport) {
  const client = new Client({ name: 'nirapod-integration-test', version: '1.0.0' });
  await client.connect(transport);
  try {
    expect(client.getServerVersion()).toMatchObject({ name: 'nirapod' });
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(TOOLS);
    for (const t of tools) expect(t.annotations?.readOnlyHint).toBe(true);

    const call = async (name: string, args: Record<string, unknown>) => {
      const r = await client.callTool({ name, arguments: args });
      expect(r.isError, name).toBeFalsy();
      const text = (r.content as Array<{ type: string; text: string }>)[0]!.text;
      expect(text).not.toMatch(/\b(?:fake|genuine|counterfeit)\b/i);
      return JSON.parse(text);
    };

    const napa = await call('search_medicine', { query: 'নাপা', limit: 2 });
    expect(napa.results[0]).toMatchObject({ brand: 'Napa', generic: 'Paracetamol' });
    expect(napa.note).toBe('Prices are from the dataset snapshot and may be out of date.');

    const alt = await call('find_cheaper_alternatives', { brand: 'Seclo' });
    expect(alt.medicine).toMatchObject({ generic: 'Omeprazole', strength: '20mg', dosage_form: 'Capsule' });
    for (const a of alt.alternatives) expect([a.generic, a.dosage_form]).toEqual(['Omeprazole', 'Capsule']);
    expect(alt.note).toBe('Confirm with your pharmacist before switching.');

    const dup = await call('check_duplicate_generics', { medicines: ['Comet', 'Daomin', 'Seclo'] });
    expect(dup.duplicates).toEqual([{ generic: 'metformin', brands: ['Comet', 'Daomin'] }]);
    expect(dup.note).toBe('Ask your doctor or pharmacist; do not stop on your own.');

    const carbs = await call('get_food_carbs', { food: 'rice' });
    expect(carbs.results[0].carbs_g_per_100g).toBe(24.3);
    expect(carbs.source.licence).toBe('CC BY 4.0');

    const exp = await call('check_expiry', { date_text: 'MFG 03/2025' });
    expect(exp.status).toBe('not_readable'); // an MFG date is never the expiry

    const { resources } = await client.listResources();
    expect(resources.map((r) => r.uri)).toContain('nirapod://safety-rules');
    const rules = await client.readResource({ uri: 'nirapod://safety-rules' });
    expect((rules.contents[0] as { text: string }).text).toContain('12. Clinical thresholds live in config/');

    const bad = await client.callTool({ name: 'search_medicine', arguments: { query: 'x'.repeat(200) } });
    expect(bad.isError).toBe(true);
  } finally {
    await client.close();
  }
}

test('stdio transport (npm run --silent mcp)', async () => {
  test.slow();
  await exercise(new StdioClientTransport({ command: 'npm', args: ['--prefix', process.cwd(), 'run', '--silent', 'mcp'], stderr: 'pipe' }));
});

test('Streamable HTTP transport (POST /api/mcp)', async ({ baseURL }) => {
  await exercise(new StreamableHTTPClientTransport(new URL('/api/mcp', baseURL)));
});

test('HTTP limits: stateless (GET / DELETE → 405) and oversized requests → 413', async ({ request }) => {
  expect((await request.get('/api/mcp')).status()).toBe(405);
  expect((await request.delete('/api/mcp')).status()).toBe(405);
  const big = await request.post('/api/mcp', { data: { jsonrpc: '2.0', id: 1, method: 'tools/list', padding: 'x'.repeat(40_000) } });
  expect(big.status()).toBe(413);
});
