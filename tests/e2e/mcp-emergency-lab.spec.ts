/**
 * Integration: the official MCP TypeScript client connects to the Nirapod Emergency and Lab Report MCP servers over
 * BOTH transports — stdio (`npm run --silent mcp:emergency` / `mcp:lab`) and stateless Streamable HTTP
 * (/api/mcp/emergency, /api/mcp/lab on the production build) — lists the tools and calls each one.
 */
import { expect, test } from '@playwright/test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

const BANNED = /\byou have\b|\b(?:fake|genuine)\b|stop taking|increase your|reduce your|eat less/i;

async function withClient<T>(transport: Transport, fn: (c: Client) => Promise<T>) {
  const client = new Client({ name: 'nirapod-integration-test', version: '1.0.0' });
  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}

async function call(client: Client, name: string, args: Record<string, unknown>) {
  const r = await client.callTool({ name, arguments: args });
  expect(r.isError, name).toBeFalsy();
  const text = (r.content as Array<{ text: string }>)[0]!.text;
  expect(text).not.toMatch(BANNED);
  return JSON.parse(text);
}

async function emergencySuite(transport: Transport) {
  await withClient(transport, async (c) => {
    expect(c.getServerVersion()).toMatchObject({ name: 'nirapod-emergency' });
    const { tools } = await c.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(['check_danger_signs', 'check_glucose_level', 'nearby_hospitals_link']);
    const danger = await call(c, 'check_danger_signs', { text: 'chest pain and face drooping' });
    expect(danger.answer.split('\n')[0]).toBe('Possible emergency — call 999 now');
    const bn = await call(c, 'check_danger_signs', { signs: ['বুকে ব্যথা'] });
    expect(bn.possible_emergency).toBe(true);
    const low = await call(c, 'check_glucose_level', { value: 3.2, unit: 'mmol/L' });
    expect(low.answer.split('\n')[0]).toMatch(/^Take something sweet now/);
    const ok = await call(c, 'check_glucose_level', { value: 100, unit: 'mg/dL', when: 'fasting' });
    expect(ok.status).toBe('within_range');
    const map = await call(c, 'nearby_hospitals_link', { lat: 23.8103, lon: 90.4125 });
    expect(map.url).toBe('https://www.google.com/maps/search/hospitals/@23.81030,90.41250,14z');
    const rules = await c.readResource({ uri: 'nirapod://emergency-rules' });
    expect((rules.contents[0] as { text: string }).text).toContain('police, fire service and ambulance providers');
  });
}

async function labSuite(transport: Transport) {
  await withClient(transport, async (c) => {
    expect(c.getServerVersion()).toMatchObject({ name: 'nirapod-lab' });
    const { tools } = await c.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(['explain_lab_value', 'list_supported_tests']);
    const hba1c = await call(c, 'explain_lab_value', { test_name: 'HbA1c', value: 7.6, unit: '%' });
    expect(hba1c).toMatchObject({ status: 'high', range_used: { low: 4, high: 5.6 } });
    expect(hba1c.answer).toMatch(/\bmay\b/);
    const bn = await call(c, 'explain_lab_value', { test_name: 'ক্রিয়েটিনিন', value: 1.8, unit: 'mg/dL' });
    expect(bn).toMatchObject({ test_key: 'creatinine', status: 'high', language: 'bn' });
    const list = await call(c, 'list_supported_tests', {});
    expect(list.tests.map((t: { key: string }) => t.key)).toEqual(expect.arrayContaining(['hba1c', 'tsh', 'alt', 'creatinine']));
    const ranges = await c.readResource({ uri: 'nirapod://lab-ranges' });
    expect((ranges.contents[0] as { text: string }).text).toContain('NEEDS CLINICIAN REVIEW');
  });
}

const stdio = (script: string) => new StdioClientTransport({ command: 'npm', args: ['--prefix', process.cwd(), 'run', '--silent', script], stderr: 'pipe' });

test('Emergency MCP over stdio (npm run --silent mcp:emergency)', async () => {
  test.slow();
  await emergencySuite(stdio('mcp:emergency'));
});

test('Emergency MCP over Streamable HTTP (/api/mcp/emergency)', async ({ baseURL }) => {
  await emergencySuite(new StreamableHTTPClientTransport(new URL('/api/mcp/emergency', baseURL)));
});

test('Lab Report MCP over stdio (npm run --silent mcp:lab)', async () => {
  test.slow();
  await labSuite(stdio('mcp:lab'));
});

test('Lab Report MCP over Streamable HTTP (/api/mcp/lab)', async ({ baseURL }) => {
  await labSuite(new StreamableHTTPClientTransport(new URL('/api/mcp/lab', baseURL)));
});

test('HTTP limits on both: GET / DELETE → 405, oversized → 413', async ({ request }) => {
  for (const path of ['/api/mcp/emergency', '/api/mcp/lab']) {
    expect((await request.get(path)).status()).toBe(405);
    expect((await request.delete(path)).status()).toBe(405);
    const big = await request.post(path, { data: { jsonrpc: '2.0', id: 1, method: 'tools/list', padding: 'x'.repeat(40_000) } });
    expect(big.status()).toBe(413);
  }
});
