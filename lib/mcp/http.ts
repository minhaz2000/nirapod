/**
 * Stateless Streamable HTTP handlers for an MCP server (Next.js route handlers, Node runtime): a fresh server and
 * transport per request, JSON responses, a 32 KB request limit, GET / DELETE → 405, Cache-Control: no-store.
 * Nothing about the request is logged. Used by /api/mcp/emergency and /api/mcp/lab.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';

export const MAX_BODY_BYTES = 32 * 1024;

const jsonRpcError = (status: number, message: string, headers: Record<string, string> = {}) =>
  Response.json({ jsonrpc: '2.0', error: { code: status === 413 ? -32600 : -32000, message }, id: null }, { status, headers });

export function statelessMcpHandlers(create: () => McpServer) {
  async function POST(req: Request): Promise<Response> {
    const length = Number(req.headers.get('content-length') ?? '0');
    if (length > MAX_BODY_BYTES) return jsonRpcError(413, 'Request too large');
    const server = create();
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
  const methodNotAllowed = () => jsonRpcError(405, 'Method not allowed: this MCP server is stateless; use POST.', { Allow: 'POST' });
  return { POST, GET: methodNotAllowed, DELETE: methodNotAllowed };
}
