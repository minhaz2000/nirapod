import { statelessMcpHandlers } from '@/lib/mcp/http';
import { createLabMcpServer } from '@/lib/mcp/lab-server';

/** Nirapod Lab Report MCP server over stateless Streamable HTTP (POST). Read-only; no user data; nothing logged. */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export const { POST, GET, DELETE } = statelessMcpHandlers(createLabMcpServer);
