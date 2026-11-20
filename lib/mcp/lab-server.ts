/**
 * Nirapod Lab Report MCP server: explains a lab value against Nirapod's reference ranges (low / normal / high, with
 * the range used), always as "may" / "possible", never a diagnosis or medicine advice. Read-only; no user data;
 * nothing logged. Tools: explain_lab_value, list_supported_tests. Resource: nirapod://lab-ranges.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import pkg from '@/package.json';
import { assertSafeOutput } from './output-safety';
import { explainLabValue, labRangesMarkdown, listSupportedTests } from './lab-tools';

export const LAB_TOOL_NAMES = ['explain_lab_value', 'list_supported_tests'] as const;
export const LAB_RANGES_URI = 'nirapod://lab-ranges';

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;
const text = (data: unknown) => ({ content: [{ type: 'text' as const, text: assertSafeOutput(JSON.stringify(data, null, 2)) }] });

const INSTRUCTIONS = `Nirapod Lab Report (Bangladesh): explains a lab value against typical adult reference ranges that
need clinician review. The range printed on the person's report always wins. Say "may" / "possible", never diagnose,
never advise starting, stopping or changing a medicine. A glucose value below 3.9 mmol/L (70 mg/dL) comes with
low-sugar guidance first. See ${LAB_RANGES_URI}.`;

export function createLabMcpServer(): McpServer {
  const server = new McpServer({ name: 'nirapod-lab', title: 'Nirapod Lab Report (Bangladesh)', version: pkg.version }, { instructions: INSTRUCTIONS });

  server.registerTool(
    'explain_lab_value',
    {
      title: 'Explain a lab report value',
      description:
        'Says whether a lab value is low, normal or high against Nirapod\'s reference range (shown with its source), with a plain explanation that uses "may" / "possible" — never a diagnosis and never medicine advice. Accepts common Bangladeshi report names and Bangla names, e.g. HbA1c, FBS, RBS, cholesterol, creatinine, SGPT, TSH, হিমোগ্লোবিন, ক্রিয়েটিনিন.',
      inputSchema: {
        test_name: z.string().trim().min(1).max(60).describe('Test name as printed, English or Bangla.'),
        value: z.number().finite().min(0).max(10_000_000).describe('The result.'),
        unit: z.string().trim().max(20).describe('Unit as printed, e.g. "%", "mmol/L", "mg/dL", "U/L", "mIU/L".'),
        language: z.enum(['en', 'bn']).optional().describe('Answer language (default: Bangla if the test name is in Bangla).'),
      },
      annotations: READ_ONLY,
    },
    async (args) => text(explainLabValue(args)),
  );

  server.registerTool(
    'list_supported_tests',
    {
      title: 'List supported lab tests',
      description: 'Lists the lab tests Nirapod can explain, with their English and Bangla names, units, reference ranges and the source of each range (needs clinician review).',
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => text(listSupportedTests()),
  );

  server.registerResource(
    'lab-ranges',
    LAB_RANGES_URI,
    { title: 'Nirapod lab reference ranges', description: 'Fallback adult reference ranges — needs clinician review.', mimeType: 'text/markdown' },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: labRangesMarkdown() }] }),
  );
  return server;
}
