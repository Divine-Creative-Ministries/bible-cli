#!/usr/bin/env node
/**
 * bible — a Bible study operating system for AI agents and humans.
 * Offline queries over open-licensed Scripture data: passage retrieval,
 * full-text search, Greek/Hebrew word study, morphology search, and
 * canon-wide pattern analysis. Every command supports --json.
 */
import { Command } from 'commander';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { registerReadCommands } from './commands/read.js';
import { registerOriginalCommands } from './commands/originals.js';
import { registerAnalysisCommands } from './commands/analysis.js';
import { registerDiscoverCommands } from './commands/discover.js';
import { registerSurveyCommand } from './commands/survey.js';
import { registerReadingCommands } from './commands/reading.js';
import { registerStudyCommands } from './commands/study.js';
import { registerInfoCommands } from './commands/info.js';
import { registerAgentCommands } from './commands/agent.js';
import { registerImportCommand } from './commands/import.js';
import { registerDoctorCommand } from './commands/doctor.js';
import { DataError, autoProvision } from './db/index.js';

const program = new Command();

program
  .name('bible')
  .description(
    `Bible study toolkit for the command line, designed for AI agents and humans.

Reading         passage, read, outline, study, search, compare
Originals       interlinear, original, lemma, word, morph, grep-morph
Analysis        survey, xref, quotes, freq, cooccur, similar, name
Introspection   books, translations, editions, licenses, morph-codes, ref
Infra           db, mcp, agent-setup

All commands accept --json for machine-readable output and exit non-zero on
errors with a helpful message. References are forgiving: "John 3:16-18",
"jn 3 16", "1jn2:5", "Psalm 23", "Gen 1:1-2:3" all work.`,
  )
  .version('0.1.9');

registerReadCommands(program);
registerOriginalCommands(program);
registerAnalysisCommands(program);
registerDiscoverCommands(program);
registerSurveyCommand(program);
registerReadingCommands(program);
registerStudyCommands(program);
registerInfoCommands(program);
registerAgentCommands(program);
registerImportCommand(program);
registerDoctorCommand(program);

program
  .command('mcp')
  .description('Run as an MCP (Model Context Protocol) server: stdio by default, or --http for remote connectors (Claude web/mobile, ChatGPT, ...)')
  .option('--http', 'serve MCP over Streamable HTTP instead of stdio')
  .option('--port <n>', 'port for --http (default 8080, or $PORT)', (v) => parseInt(v, 10))
  .action(async (opts: { http?: boolean; port?: number }) => {
    if (opts.http) {
      const { runMcpHttpServer } = await import('./mcp/server.js');
      await runMcpHttpServer(opts.port ?? parseInt(process.env.PORT ?? '8080', 10));
    } else {
      const { runMcpServer } = await import('./mcp/server.js');
      await runMcpServer();
    }
  });

// Self-provisioning: commands that need data trigger a one-time download of
// the missing database(s). Opt out with BIBLE_CLI_NO_AUTO_DOWNLOAD=1.
const NEEDS_CORE = new Set([
  'passage', 'read', 'outline', 'search', 'compare', 'xref', 'freq', 'cooccur', 'similar', 'name',
  'survey', 'quotes', 'licenses', 'translations', 'interlinear', 'original',
  'lemma', 'word', 'morph', 'grep-morph', 'morph-codes', 'import', 'study',
]);
const NEEDS_STUDY = new Set([
  'interlinear', 'original', 'lemma', 'word', 'morph', 'grep-morph',
  'morph-codes', 'cooccur', 'similar', 'name', 'survey', 'freq', 'quotes',
]);
program.hook('preAction', async (_thisCommand, actionCommand) => {
  // Subcommands (e.g. `study next`) provision by their group's name.
  const names = [actionCommand.name(), actionCommand.parent?.name() ?? ''];
  if (process.env.BIBLE_CLI_NO_AUTO_DOWNLOAD === '1') return;
  await autoProvision(names.some((n) => NEEDS_CORE.has(n)), names.some((n) => NEEDS_STUDY.has(n)));
});

async function main(): Promise<void> {
  try {
    await program.parseAsync(process.argv);
  } catch (e) {
    if (e instanceof DataError) {
      process.stderr.write(`error: ${e.message}\n`);
      process.exit(2);
    }
    throw e;
  }
}

export { program };

// Run only when executed directly (bin/npx/node), not when imported by
// tooling such as the docs generator.
const isMain = ((): boolean => {
  try {
    return fs.realpathSync(process.argv[1] ?? '') === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();
if (isMain) void main();
