/**
 * Documentation generator: the CLI itself is the source of truth.
 * Emits docs/commands.json (machine-readable, consumed by the landing page's
 * sync workflow), docs/COMMANDS.md, refreshed docs/METHODOLOGY.md and
 * docs/DATA-SOURCES.md, and rewrites README.md's command table between
 * markers. Run via `npm run gen-docs`; CI runs it on every push to main and
 * commits any drift.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { program } from '../src/cli.js';
import { METHODOLOGY } from '../src/commands/agent.js';
import { SOURCES } from '../pipeline/build.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const GROUPS: Array<{ title: string; commands: string[] }> = [
  { title: 'Reading', commands: ['passage', 'read', 'outline', 'search', 'compare'] },
  { title: 'Original languages', commands: ['interlinear', 'original', 'lemma', 'word', 'morph', 'grep-morph'] },
  { title: 'Pattern analysis', commands: ['survey', 'quotes', 'xref', 'freq', 'cooccur', 'similar', 'name'] },
  { title: 'Introspection', commands: ['books', 'translations', 'editions', 'morph-codes', 'licenses', 'ref'] },
  { title: 'Infrastructure', commands: ['db', 'mcp', 'agent-setup'] },
];

interface CmdDoc {
  name: string;
  usage: string;
  description: string;
  summary: string; // description with the Examples: tail stripped
  options: Array<{ flags: string; description: string }>;
}

function collect(): CmdDoc[] {
  return program.commands.map((c) => {
    const desc = c.description();
    return {
      name: c.name(),
      usage: `${c.name()}${c.usage() ? ' ' + c.usage() : ''}`.replace(' [options]', '').replace('[options] ', '').trim(),
      description: desc,
      summary: desc.split(/\s+Examples?:/)[0]!.replace(/\s+Example:.*$/, '').trim(),
      options: c.options
        .filter((o) => !['--json'].includes(o.long ?? ''))
        .map((o) => ({ flags: o.flags, description: o.description ?? '' })),
    };
  });
}

function main(): void {
  const cmds = collect();
  const byName = new Map(cmds.map((c) => [c.name, c]));
  const version = program.version() ?? '';

  // 1. commands.json — consumed by the landing page sync
  const json = {
    generated_from: `bible-cli v${version}`,
    groups: GROUPS.map((g) => ({
      title: g.title,
      commands: g.commands
        .filter((n) => byName.has(n))
        .map((n) => {
          const c = byName.get(n)!;
          return { name: c.name, usage: c.usage, summary: c.summary, options: c.options };
        }),
    })),
  };
  fs.writeFileSync(path.join(ROOT, 'docs', 'commands.json'), JSON.stringify(json, null, 2) + '\n');

  // 2. COMMANDS.md — full reference
  const md: string[] = [
    '# Command reference',
    '',
    `_Generated from bible-cli v${version} — do not edit by hand; run \`npm run gen-docs\`._`,
    '',
  ];
  for (const g of json.groups) {
    md.push(`## ${g.title}`, '');
    for (const c of g.commands) {
      md.push(`### \`bible ${c.usage}\``, '', c.summary, '');
      if (c.options.length) {
        md.push('| Option | Description |', '|---|---|');
        for (const o of c.options) md.push(`| \`${o.flags}\` | ${o.description.replace(/\|/g, '\\|')} |`);
        md.push('');
      }
    }
  }
  md.push('All commands also accept `--json` for machine-readable output.', '');
  fs.writeFileSync(path.join(ROOT, 'docs', 'COMMANDS.md'), md.join('\n'));

  // 3. METHODOLOGY.md + DATA-SOURCES.md from the code, no DB needed
  fs.writeFileSync(path.join(ROOT, 'docs', 'METHODOLOGY.md'), METHODOLOGY);
  fs.writeFileSync(
    path.join(ROOT, 'docs', 'DATA-SOURCES.md'),
    SOURCES.map((s) => `${s.title}\n  ${s.url}\n  license: ${s.license}\n  ${s.attribution}`).join('\n\n') + '\n',
  );

  // 4. README command table between markers
  const readmePath = path.join(ROOT, 'README.md');
  let readme = fs.readFileSync(readmePath, 'utf8');
  const START = '<!-- commands:start -->';
  const END = '<!-- commands:end -->';
  if (readme.includes(START) && readme.includes(END)) {
    const rows: string[] = ['| Command | What it does |', '|---|---|'];
    for (const g of json.groups) {
      for (const c of g.commands) {
        rows.push(`| \`${c.usage}\` | ${c.summary.replace(/\|/g, '\\|')} |`);
      }
    }
    readme = readme.slice(0, readme.indexOf(START) + START.length) + '\n' + rows.join('\n') + '\n' + readme.slice(readme.indexOf(END));
    fs.writeFileSync(readmePath, readme);
  }

  process.stdout.write(`docs generated for v${version}: ${cmds.length} commands\n`);
}

main();
