/**
 * Nirapod Emergency MCP server: danger signs, low blood sugar first (rule 6) and a nearby-hospitals link, from the
 * app's own rules. Read-only; no user data; nothing logged. Tools: check_danger_signs, check_glucose_level,
 * nearby_hospitals_link. Resource: nirapod://emergency-rules.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import pkg from '@/package.json';
import { assertSafeOutput } from './output-safety';
import { DANGER_SIGN_IDS } from '@/lib/rules/danger-signs';
import { checkDangerSigns, checkGlucoseLevel, emergencyRulesMarkdown, nearbyHospitalsLink } from './emergency-tools';

export const EMERGENCY_TOOL_NAMES = ['check_danger_signs', 'check_glucose_level', 'nearby_hospitals_link'] as const;
export const EMERGENCY_RULES_URI = 'nirapod://emergency-rules';

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;
const language = z.enum(['en', 'bn']).optional().describe('Answer language: "en" or "bn" (default: Bangla if the input is in Bangla, else English).');
const reply = (data: { answer: string }) => ({ content: [{ type: 'text' as const, text: assertSafeOutput(JSON.stringify(data, null, 2)) }] });

const INSTRUCTIONS = `Nirapod Emergency (Bangladesh): checks danger signs and blood sugar with Nirapod's fixed rules.
If check_danger_signs says possible_emergency, tell the person to call 999 now before anything else. Below 3.9 mmol/L
(70 mg/dL), give the low-sugar guidance first (something sweet now, 999 if needed) and never suggest eating less.
Never diagnose, never advise changing a medicine or dose. 999 connects to police, fire service and ambulance providers.
See ${EMERGENCY_RULES_URI}.`;

export function createEmergencyMcpServer(): McpServer {
  const server = new McpServer({ name: 'nirapod-emergency', title: 'Nirapod Emergency (Bangladesh)', version: pkg.version }, { instructions: INSTRUCTIONS });

  server.registerTool(
    'check_danger_signs',
    {
      title: 'Check emergency danger signs',
      description:
        `Checks a description (English or Bangla) and/or checklist sign ids against Nirapod's emergency danger-sign list (chest pain, FAST stroke signs, severe breathing difficulty, unconscious, heavy bleeding, low blood sugar). If any sign matches, the answer's first line is "Possible emergency — call 999 now". Sign ids: ${DANGER_SIGN_IDS.join(', ')}.`,
      inputSchema: {
        signs: z.array(z.string().trim().min(1).max(200)).max(20).optional().describe('Checklist sign ids and/or short descriptions, e.g. ["chestPain"] or ["face drooping", "বুকে ব্যথা"].'),
        text: z.string().trim().max(1000).optional().describe('A free-text description of what is happening, English or Bangla.'),
        language,
      },
      annotations: READ_ONLY,
    },
    async (args) => reply(checkDangerSigns(args)),
  );

  server.registerTool(
    'check_glucose_level',
    {
      title: 'Check a blood sugar reading',
      description:
        'Checks a blood glucose reading. Below 3.9 mmol/L (70 mg/dL) the answer starts with low-sugar emergency guidance: take something sweet now, call 999 if needed (it never suggests eating less). Otherwise it compares the value with the usual range for a fasting, random or 2-hour after-meal test.',
      inputSchema: {
        value: z.number().positive().max(2000).describe('The reading.'),
        unit: z.enum(['mmol/L', 'mg/dL']).describe('"mmol/L" or "mg/dL".'),
        when: z.enum(['fasting', 'random', 'after_meal']).optional().describe('When it was measured (default "random").'),
        language,
      },
      annotations: READ_ONLY,
    },
    async (args) => reply(checkGlucoseLevel(args)),
  );

  server.registerTool(
    'nearby_hospitals_link',
    {
      title: 'Link to nearby hospitals',
      description: 'Returns a Google Maps search link for hospitals near the given coordinates. The location is used only to build the link; it is never stored or logged. In an emergency, call 999 first.',
      inputSchema: {
        lat: z.number().min(-90).max(90).describe('Latitude, e.g. 23.8103 (Dhaka).'),
        lon: z.number().min(-180).max(180).describe('Longitude, e.g. 90.4125.'),
        language,
      },
      annotations: READ_ONLY,
    },
    async (args) => reply(nearbyHospitalsLink(args)),
  );

  server.registerResource(
    'emergency-rules',
    EMERGENCY_RULES_URI,
    { title: 'Nirapod emergency rules', description: 'The danger-sign checklist, advice, the low-sugar rule and the 999 note.', mimeType: 'text/markdown' },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: emergencyRulesMarkdown() }] }),
  );
  return server;
}
