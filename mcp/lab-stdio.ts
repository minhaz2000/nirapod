/** Nirapod Lab Report MCP server over stdio: `npm run --silent mcp:lab`. Writes only MCP messages to stdout. */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createLabMcpServer } from '@/lib/mcp/lab-server';

createLabMcpServer()
  .connect(new StdioServerTransport())
  .catch((err) => {
    process.stderr.write(`nirapod-lab-mcp: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
