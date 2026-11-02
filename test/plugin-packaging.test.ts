import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The plugin is remote-only and ships outside the npm release flow, so nothing
 * else ties it to the package. A version left behind here pins Claude Code
 * users to the old plugin, and a package.json in the plugin folder makes Claude
 * Code run npm on install, which the README says does not happen. Docs that name
 * a tool the server lacks send the model after something that isn't there.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLUGIN = 'plugins/bible-cli';
const HOSTED_URL = 'https://mcp.biblecli.org/mcp';

const read = (file: string): string => fs.readFileSync(path.join(ROOT, file), 'utf8');
const readJson = (file: string): any => JSON.parse(read(file));
const exists = (file: string): boolean => fs.existsSync(path.join(ROOT, file));
const toolNames = (snapshot: string): string[] =>
  (readJson(`test/__snapshots__/${snapshot}`).tools as { name: string }[]).map((t) => t.name);

const HOSTED_TOOLS = new Set(toolNames('mcp-tools.http.json'));
const LOCAL_TOOLS = new Set([...toolNames('mcp-tools.stdio.json'), 'study_*']);

/** Command-line names SKILL.md maps to tools, plus the `search` count parameter. */
const SKILL_NON_TOOLS = new Set(['word', 'freq', 'xref', 'quotes', 'similar', 'cooccur', 'name', 'grep-morph', 'syntax', 'count']);

/** snake_case names anywhere in the text, including `study_*`. */
const snakeCaseNames = (text: string): string[] => [...text.matchAll(/\b[a-z][a-z0-9]*(?:_(?:[a-z0-9]+|\*))+/g)].map((m) => m[0]);
const backticked = (text: string): string[] => [...text.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]);

describe('plugin packaging', () => {
  it.each([`${PLUGIN}/.cursor-plugin/plugin.json`, `${PLUGIN}/.claude-plugin/plugin.json`])('%s matches package.json', (file) => {
    const manifest = readJson(file);
    expect(manifest.name).toBe('bible-cli');
    expect(manifest.version).toBe(readJson('package.json').version);
    expect(manifest.license).toBe(readJson('package.json').license);
  });

  it.each([
    [`${PLUGIN}/mcp.json`, { url: HOSTED_URL }],
    [`${PLUGIN}/.mcp.json`, { type: 'http', url: HOSTED_URL }],
  ])('%s declares only the hosted server', (file, server) => {
    expect(readJson(file)).toEqual({ mcpServers: { 'bible-cli': server } });
  });

  it('declares no MCP servers inside either manifest', () => {
    for (const file of [`${PLUGIN}/.cursor-plugin/plugin.json`, `${PLUGIN}/.claude-plugin/plugin.json`]) {
      expect(readJson(file)).not.toHaveProperty('mcpServers');
    }
  });

  it('keeps anything that installs or runs code out of the plugin folder', () => {
    for (const file of ['package.json', 'package-lock.json', 'hooks', 'bin', 'scripts', 'node_modules']) {
      expect(exists(`${PLUGIN}/${file}`)).toBe(false);
    }
  });

  it('points both marketplaces at the plugin folder', () => {
    expect(readJson('.claude-plugin/marketplace.json').plugins).toMatchObject([{ name: 'bible-cli', source: `./${PLUGIN}` }]);
    expect(readJson('.cursor-plugin/marketplace.json').plugins).toMatchObject([{ name: 'bible-cli', source: PLUGIN }]);
  });

  it('ships a copy of the root license with the plugin', () => {
    expect(read(`${PLUGIN}/LICENSE`)).toBe(read('LICENSE'));
  });

  it('points manifests at logo files that exist', () => {
    expect(exists(`${PLUGIN}/${readJson(`${PLUGIN}/.cursor-plugin/plugin.json`).logo}`)).toBe(true);
    expect(exists(`${PLUGIN}/${readJson(`${PLUGIN}/.claude-plugin/plugin.json`).icon}`)).toBe(true);
  });

  it('ships the skill folder in the npm package', () => {
    expect(readJson('package.json').files).toContain(`${PLUGIN}/skills`);
  });

  it('names only hosted tools in the skill', () => {
    const skill = read(`${PLUGIN}/skills/bible-study/SKILL.md`);
    expect(skill.startsWith('---\nname: bible-study\ndescription: ')).toBe(true);

    const body = skill.slice(skill.indexOf('\n---\n'));
    expect(backticked(body).filter((name) => !HOSTED_TOOLS.has(name) && !SKILL_NON_TOOLS.has(name))).toEqual([]);
    expect(snakeCaseNames(body).filter((name) => !HOSTED_TOOLS.has(name))).toEqual([]);
    expect(body).not.toMatch(/\bsql\b/);
  });

  it('names only hosted tools in the plugin README', () => {
    const readme = read(`${PLUGIN}/README.md`);
    expect(snakeCaseNames(readme).filter((name) => !HOSTED_TOOLS.has(name))).toEqual([]);
    expect(readme).not.toMatch(/\bsql\b/);
  });

  it('names only real tools anywhere in the root README', () => {
    expect(snakeCaseNames(read('README.md')).filter((name) => !LOCAL_TOOLS.has(name))).toEqual([]);
  });
});
