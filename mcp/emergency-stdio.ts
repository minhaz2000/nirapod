/** Nirapod Emergency MCP server over stdio: `npm run --silent mcp:emergency`. Writes only MCP messages to stdout. */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createEmergencyMcpServer } from '@/lib/mcp/emergency-server';

createEmergencyMcpServer()
  .connect(new StdioServerTransport())
  .catch((err) => {
    process.stderr.write(`nirapod-emergency-mcp: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
