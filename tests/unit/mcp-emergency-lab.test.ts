/** Nirapod Emergency and Lab Report MCP servers: every tool, the safety output check, and in-memory MCP clients. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { checkDangerSigns, checkGlucoseLevel, emergencyRulesMarkdown, nearbyHospitalsLink } from '@/lib/mcp/emergency-tools';
import { createEmergencyMcpServer, EMERGENCY_RULES_URI, EMERGENCY_TOOL_NAMES } from '@/lib/mcp/emergency-server';
import { explainLabValue, labRangesMarkdown, listSupportedTests, resolveTestKey } from '@/lib/mcp/lab-tools';
import { createLabMcpServer, LAB_RANGES_URI, LAB_TOOL_NAMES } from '@/lib/mcp/lab-server';
import { assertSafeOutput, outputViolation } from '@/lib/mcp/output-safety';

const firstLine = (s: string) => s.split('\n')[0];

describe('check_danger_signs (lib/rules/danger-signs.ts)', () => {
  it('chest pain → possible emergency; first line is the 999 call', () => {
    const r = checkDangerSigns({ text: 'My father has chest pain and is sweating' });
    expect(r.possible_emergency).toBe(true);
    expect(r.matched_signs.map((s) => s.id)).toEqual(['chestPain']);
    expect(firstLine(r.answer)).toBe('Possible emergency — call 999 now');
    expect(r.answer).toContain('police, fire service and ambulance providers');
  });

  it('FAST stroke signs (ids and words) → emergency with "note the time"', () => {
    const r = checkDangerSigns({ signs: ['strokeFace', 'sudden arm weakness', 'slurred speech'] });
    expect(r.matched_signs.map((s) => s.id)).toEqual(['strokeFace', 'strokeArm', 'strokeSpeech']);
    expect(r.advice).toContain('Note the time the stroke signs started and tell the doctor.');
    expect(firstLine(r.answer)).toBe('Possible emergency — call 999 now');
  });

  it('Bangla input → Bangla answer, first line the 999 call', () => {
    const r = checkDangerSigns({ text: 'আব্বার বুকে ব্যথা হচ্ছে' });
    expect(r.language).toBe('bn');
    expect(firstLine(r.answer)).toBe('সম্ভাব্য জরুরি অবস্থা — এখনই ৯৯৯-এ ফোন করুন');
  });

  it('low sugar in the text adds the lowGlucose sign and the "something sweet" advice', () => {
    const r = checkDangerSigns({ text: 'my sugar is 3.1 and I am shaking' });
    expect(r.matched_signs.map((s) => s.id)).toContain('lowGlucose');
    expect(r.advice.join(' ')).toMatch(/something sweet/);
  });

  it('no danger sign → not an emergency, but still says when to call 999', () => {
    const r = checkDangerSigns({ text: 'mild headache since morning' });
    expect(r.possible_emergency).toBe(false);
    expect(r.answer).toMatch(/call 999/);
  });
});

describe('check_glucose_level (rule 6)', () => {
  it('3.2 mmol/L → starts with the low-sugar guidance', () => {
    const r = checkGlucoseLevel({ value: 3.2, unit: 'mmol/L' });
    expect(r.status).toBe('low_emergency');
    expect(firstLine(r.answer)).toBe('Take something sweet now (juice, sugar or glucose). If you feel confused or faint, call 999.');
    expect(r.answer).not.toMatch(/eat less|reduce|skip/i);
  });

  it('60 mg/dL → low (3.3 mmol/L), Bangla answer when asked', () => {
    const r = checkGlucoseLevel({ value: 60, unit: 'mg/dL', language: 'bn' });
    expect(r).toMatchObject({ status: 'low_emergency', mmol_per_l: 3.3, low_threshold: { mmol_per_l: 3.9, mg_per_dl: 70 } });
    expect(firstLine(r.answer)).toBe('এখনই মিষ্টি কিছু খান (জুস, চিনি বা গ্লুকোজ)। বিভ্রান্ত বা অজ্ঞান লাগলে ৯৯৯-এ ফোন করুন।');
  });

  it('normal glucose → not low, within the usual range', () => {
    const r = checkGlucoseLevel({ value: 5.2, unit: 'mmol/L', when: 'fasting' });
    expect(r).toMatchObject({ status: 'within_range', low_sugar_emergency: false, usual_range_mmol_per_l: '3.9 - 5.6' });
    expect(firstLine(r.answer)).toMatch(/^Blood sugar 5.2 mmol\/L .* is not below the low-sugar level/);
  });

  it('high after-meal value → above the range, no dose advice', () => {
    const r = checkGlucoseLevel({ value: 220, unit: 'mg/dL', when: 'after_meal' });
    expect(r.status).toBe('above_range');
    expect(r.answer).toContain('do not stop on your own');
    expect(outputViolation(r.answer)).toBeNull();
  });

  it('impossible numbers ask to check the reading', () => {
    expect(checkGlucoseLevel({ value: 900, unit: 'mmol/L' }).status).toBe('check_number');
  });
});

describe('nearby_hospitals_link', () => {
  it('returns a Google Maps hospitals search link and the 999 note', () => {
    const r = nearbyHospitalsLink({ lat: 23.8103, lon: 90.4125 });
    expect(r.url).toBe('https://www.google.com/maps/search/hospitals/@23.81030,90.41250,14z');
    expect(r.answer).toMatch(/call 999 first/);
    expect(r.answer).toMatch(/not stored or logged/);
  });
});

describe('emergency rules resource', () => {
  it('lists every danger sign and the 999 note', () => {
    const md = emergencyRulesMarkdown();
    for (const id of ['chestPain', 'strokeFace', 'strokeArm', 'strokeSpeech', 'breathing', 'unconscious', 'bleeding', 'lowGlucose']) expect(md).toContain(`\`${id}\``);
    expect(md).toContain('It connects you to police, fire service and ambulance providers.');
    expect(md).toContain('NEEDS CLINICIAN REVIEW');
  });
});

describe('explain_lab_value (lib/rules/report-ranges.ts)', () => {
  it('HbA1c 7.6 % → high against 4.0–5.6, "may", never a diagnosis or medicine advice', () => {
    const r = explainLabValue({ test_name: 'HbA1c', value: 7.6, unit: '%' });
    expect(r).toMatchObject({ test_key: 'hba1c', status: 'high', range_used: { low: 4, high: 5.6 } });
    expect(r.answer).toMatch(/\bmay\b/);
    expect(r.answer).toMatch(/not a diagnosis/);
    expect(r.range_source).toMatch(/needs clinician review/);
    expect(outputViolation(r.answer)).toBeNull();
  });

  it.each([
    ['FBS', 7.8, 'mmol/L', 'fasting_glucose', 'high'],
    ['RBS', 6.5, 'mmol/L', 'random_glucose', 'normal'],
    ['Total Cholesterol', 240, 'mg/dL', 'total_cholesterol', 'high'],
    ['S. Creatinine', 1.0, 'mg/dl', 'creatinine', 'normal'],
    ['SGPT', 85, 'U/L', 'alt', 'high'],
    ['TSH', 0.2, 'mIU/L', 'tsh', 'low'],
    ['হিমোগ্লোবিন', 9.8, 'g/dL', 'hemoglobin', 'low'],
    ['ক্রিয়েটিনিন', 1.8, 'mg/dL', 'creatinine', 'high'],
    ['খালি পেটে সুগার', 5.0, 'mmol/L', 'fasting_glucose', 'normal'],
  ])('%s %s %s → %s %s', (name, value, unit, key, status) => {
    const r = explainLabValue({ test_name: name, value, unit });
    expect(r.test_key).toBe(key);
    expect(r.status).toBe(status);
  });

  it('a Bangla test name answers in Bangla', () => {
    const r = explainLabValue({ test_name: 'ক্রিয়েটিনিন', value: 1.8, unit: 'mg/dL' });
    expect(r.language).toBe('bn');
    expect(r.answer).toContain('হতে পারে');
    expect(r.answer).toContain('রোগ নির্ণয় নয়');
  });

  it('a low fasting glucose gives the low-sugar guidance first (rule 6)', () => {
    const r = explainLabValue({ test_name: 'FBS', value: 3.1, unit: 'mmol/L' });
    expect(r.low_sugar_emergency).toBe(true);
    expect(firstLine(r.answer)).toMatch(/give something sweet now/);
  });

  it('unknown test and unsupported unit are said plainly', () => {
    expect(explainLabValue({ test_name: 'Vitamin Q', value: 3, unit: 'ng/mL' })).toMatchObject({ recognised: false, status: 'unknown' });
    expect(explainLabValue({ test_name: 'HbA1c', value: 50, unit: 'mmol/mol' })).toMatchObject({ recognised: true, status: 'unknown', supported_units: ['%'] });
  });

  it('resolves common Bangladeshi and Bangla names', () => {
    expect(resolveTestKey('HbA1c')).toBe('hba1c');
    expect(resolveTestKey('SGPT (ALT)')).toBe('alt');
    expect(resolveTestKey('এসজিপিটি')).toBe('alt');
    expect(resolveTestKey('টিএসএইচ')).toBe('tsh');
    expect(resolveTestKey('Vitamin Q')).toBeNull();
  });
});

describe('list_supported_tests and lab ranges', () => {
  it('every test has units, ranges and the source; Bangla names included', () => {
    const r = listSupportedTests();
    const keys = r.tests.map((t) => t.key);
    for (const k of ['hba1c', 'fasting_glucose', 'random_glucose', 'total_cholesterol', 'creatinine', 'alt', 'tsh']) expect(keys).toContain(k);
    for (const t of r.tests) {
      expect(t.units.length).toBeGreaterThan(0);
      expect(t.source).toMatch(/needs clinician review/);
    }
    expect(r.tests.find((t) => t.key === 'creatinine')!.names_bn).toContain('ক্রিয়েটিনিন');
    expect(labRangesMarkdown()).toContain('NEEDS CLINICIAN REVIEW');
  });
});

describe('output safety check', () => {
  it.each([
    ['You have diabetes.'],
    ['This medicine is fake.'],
    ['The pack looks genuine.'],
    ['Increase your insulin dose by 2 units.'],
    ['Stop taking metformin.'],
    ['Eat less rice.'],
    ['ওষুধটি নকল।'],
  ])('bans "%s"', (text) => {
    expect(() => assertSafeOutput(text)).toThrow();
  });
  it('allows the safe phrases', () => {
    expect(assertSafeOutput('Ask your doctor or pharmacist; do not stop on your own.')).toBeTruthy();
    expect(assertSafeOutput('This is general information, not a diagnosis.')).toBeTruthy();
  });
});

async function connect(server: McpServer) {
  const client = new Client({ name: 'nirapod-test', version: '1.0.0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}
const parse = (r: Awaited<ReturnType<Client['callTool']>>) => JSON.parse((r.content as Array<{ text: string }>)[0]!.text);

describe('MCP servers (in-memory client)', () => {
  let emergency: Client;
  let lab: Client;
  beforeAll(async () => {
    emergency = await connect(createEmergencyMcpServer());
    lab = await connect(createLabMcpServer());
  });
  afterAll(async () => {
    await emergency.close();
    await lab.close();
  });

  it('Emergency: three read-only tools with schemas; each call works; the resource is served', async () => {
    const { tools } = await emergency.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...EMERGENCY_TOOL_NAMES].sort());
    for (const t of tools) expect(t.annotations?.readOnlyHint).toBe(true);
    expect(parse(await emergency.callTool({ name: 'check_danger_signs', arguments: { text: 'chest pain' } })).possible_emergency).toBe(true);
    expect(parse(await emergency.callTool({ name: 'check_glucose_level', arguments: { value: 60, unit: 'mg/dL' } })).status).toBe('low_emergency');
    expect(parse(await emergency.callTool({ name: 'nearby_hospitals_link', arguments: { lat: 23.8, lon: 90.4 } })).url).toMatch(/google\.com\/maps/);
    const bad = await emergency.callTool({ name: 'nearby_hospitals_link', arguments: { lat: 123, lon: 90 } });
    expect(bad.isError).toBe(true);
    const res = await emergency.readResource({ uri: EMERGENCY_RULES_URI });
    expect((res.contents[0] as { text: string }).text).toContain('999');
  });

  it('Lab: two read-only tools; each call works; the resource is served', async () => {
    const { tools } = await lab.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...LAB_TOOL_NAMES].sort());
    expect(parse(await lab.callTool({ name: 'explain_lab_value', arguments: { test_name: 'HbA1c', value: 7.6, unit: '%' } })).status).toBe('high');
    expect(parse(await lab.callTool({ name: 'list_supported_tests', arguments: {} })).tests.length).toBeGreaterThan(10);
    const res = await lab.readResource({ uri: LAB_RANGES_URI });
    expect((res.contents[0] as { text: string }).text).toContain('NEEDS CLINICIAN REVIEW');
  });
});
