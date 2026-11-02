import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The plugin is remote-only and ships outside the npm release flow, so nothing
 * else ties it to the package. A version left behind here pins Claude Code
 * users to the old plugin, and a skill naming a local-only tool sends the model
 * after a tool the hosted server does not have.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOSTED_URL = 'https://mcp.biblecli.org/mcp';

const read = (file: string): string => fs.readFileSync(path.join(ROOT, file), 'utf8');
const readJson = (file: string): any => JSON.parse(read(file));

describe('plugin packaging', () => {
  it.each(['.cursor-plugin/plugin.json', '.claude-plugin/plugin.json'])('%s matches package.json', (file) => {
    const manifest = readJson(file);
    expect(manifest.name).toBe('bible-cli');
    expect(manifest.version).toBe(readJson('package.json').version);
    expect(manifest.license).toBe(readJson('package.json').license);
  });

  it.each([
    ['mcp.json', { url: HOSTED_URL }],
    ['.mcp.json', { type: 'http', url: HOSTED_URL }],
  ])('%s declares only the hosted server', (file, server) => {
    expect(readJson(file)).toEqual({ mcpServers: { 'bible-cli': server } });
  });

  it('declares no MCP servers inside either manifest', () => {
    for (const file of ['.cursor-plugin/plugin.json', '.claude-plugin/plugin.json']) {
      expect(readJson(file)).not.toHaveProperty('mcpServers');
    }
  });

  it('points manifests at logo files that exist', () => {
    expect(fs.existsSync(path.join(ROOT, readJson('.cursor-plugin/plugin.json').logo))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, readJson('.claude-plugin/plugin.json').icon))).toBe(true);
  });

  it('routes the skill only to tools the hosted server serves', () => {
    const skill = read('skills/bible-study/SKILL.md');
    expect(skill.startsWith('---\nname: bible-study\ndescription: ')).toBe(true);

    const hosted = new Set((readJson('test/__snapshots__/mcp-tools.http.json').tools as { name: string }[]).map((t) => t.name));
    const table = skill.slice(skill.indexOf('## Match the tool to the question'), skill.indexOf('## Match the evidence to the claim'));
    const named = [...table.matchAll(/^\|.*\|.*\|$/gm)].flatMap((row) => [...row[0].matchAll(/`([a-z_]+)`/g)].map((m) => m[1]));
    expect(named.length).toBeGreaterThan(0);
    expect(named.filter((name) => !hosted.has(name))).toEqual([]);
  });
});
