import { statelessMcpHandlers } from '@/lib/mcp/http';
import { createEmergencyMcpServer } from '@/lib/mcp/emergency-server';

/** Nirapod Emergency MCP server over stateless Streamable HTTP (POST). Read-only; no user data; nothing logged. */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export const { POST, GET, DELETE } = statelessMcpHandlers(createEmergencyMcpServer);
