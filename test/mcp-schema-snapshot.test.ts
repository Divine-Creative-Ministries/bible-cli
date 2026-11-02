import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import { buildServer } from '../src/mcp/server.js';

/**
 * Tool names and input schemas are a public contract: the Bible Depth app pins
 * to them. These snapshots fail on ANY change to that surface, so update them
 * only for a deliberate, coordinated contract change.
 *
 * List-only: nothing here calls a tool, so no scripture database or network is
 * needed.
 */
const MODES = [
  { mode: 'stdio', options: { includeSql: true, includeLocalState: true }, count: 35 },
  { mode: 'http', options: { includeSql: false }, count: 25 },
] as const;

async function listTools(options: Parameters<typeof buildServer>[0]) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = buildServer(options);
  const client = new Client({ name: 'schema-snapshot-test', version: '0.0.0' });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const { tools } = await client.listTools();
    return [...tools].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  } finally {
    await client.close();
    await server.close();
  }
}

describe.each(MODES)('MCP tool surface ($mode)', ({ mode, options, count }) => {
  it('keeps tool names and input schemas exactly as committed', async () => {
    const tools = await listTools(options);
    expect(tools).toHaveLength(count);
    const surface = { count: tools.length, tools: tools.map(({ name, inputSchema }) => ({ name, inputSchema })) };
    await expect(JSON.stringify(surface, null, 2) + '\n').toMatchFileSnapshot(`./__snapshots__/mcp-tools.${mode}.json`);
  });

  it('gives every tool a human title and all four annotation hints', async () => {
    for (const tool of await listTools(options)) {
      expect(tool.title?.trim(), tool.name).toBeTruthy();
      for (const hint of ['readOnlyHint', 'destructiveHint', 'idempotentHint', 'openWorldHint'] as const) {
        expect(typeof tool.annotations?.[hint], `${tool.name}.${hint}`).toBe('boolean');
      }
    }
  });
});
