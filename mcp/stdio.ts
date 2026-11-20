/**
 * Nirapod MCP server over stdio: `npm run --silent mcp` (or `tsx --tsconfig <repo>/tsconfig.json <repo>/mcp/stdio.ts`).
 * Opens the read-only SQLite files in data/build/ (run `npm run build:data` once), found relative to this file so the
 * client may start it from any directory. Writes nothing but MCP messages to stdout; never logs queries.
 */
import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createNirapodMcpServer } from '@/lib/mcp/server';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function openReadOnly(file: string): Database.Database | null {
  const path = join(ROOT, 'data', 'build', file);
  return existsSync(path) ? new Database(path, { readonly: true, fileMustExist: true }) : null;
}

async function main() {
  const medicines = openReadOnly('medicines.sqlite');
  const nutrition = openReadOnly('nutrition.sqlite');
  if (!medicines || !nutrition) process.stderr.write('nirapod-mcp: data/build/*.sqlite missing — run `npm run build:data` first.\n');
  const server = createNirapodMcpServer({ medicines, nutrition });
  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  process.stderr.write(`nirapod-mcp: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
