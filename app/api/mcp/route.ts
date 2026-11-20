import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { getMedicineDb, getNutritionDb } from '@/lib/medicine/db';
import { createNirapodMcpServer } from '@/lib/mcp/server';

/**
 * Nirapod MCP server over stateless Streamable HTTP (POST /api/mcp). Each request gets a fresh server and
 * transport (no sessions), JSON responses, read-only data, a request-size limit, and no logging of what is asked.
 * The SQLite files ship with this route via outputFileTracingIncludes in next.config.ts ('/api/**').
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MAX_BODY_BYTES = 32 * 1024;

async function handle(req: Request): Promise<Response> {
  if (req.method === 'POST') {
    const length = Number(req.headers.get('content-length') ?? '0');
    if (length > MAX_BODY_BYTES) return Response.json({ jsonrpc: '2.0', error: { code: -32600, message: 'Request too large' }, id: null }, { status: 413 });
  }
  const server = createNirapodMcpServer({ medicines: getMedicineDb(), nutrition: getNutritionDb() });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    const res = await transport.handleRequest(req);
    const headers = new Headers(res.headers);
    headers.set('Cache-Control', 'no-store');
    return new Response(res.body, { status: res.status, headers });
  } finally {
    await server.close();
  }
}

export const POST = handle;

/** Stateless server: no server-initiated stream (GET) and no sessions to end (DELETE). */
function methodNotAllowed() {
  return Response.json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed: this MCP server is stateless; use POST.' }, id: null }, { status: 405, headers: { Allow: 'POST' } });
}
export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;
