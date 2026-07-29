#!/usr/bin/env node
/**
 * bible — a Bible study operating system for AI agents and humans.
 * Offline queries over open-licensed Scripture data: passage retrieval,
 * full-text search, Greek/Hebrew word study, morphology search, and
 * canon-wide pattern analysis. Every command supports --json.
 */
import { Command } from 'commander';
import { registerReadCommands } from './commands/read.js';
import { registerOriginalCommands } from './commands/originals.js';
import { registerAnalysisCommands } from './commands/analysis.js';
import { registerDiscoverCommands } from './commands/discover.js';
import { registerInfoCommands } from './commands/info.js';
import { registerAgentCommands } from './commands/agent.js';
import { DataError } from './db/index.js';

const program = new Command();

program
  .name('bible')
  .description(
    `Bible study toolkit for the command line, designed for AI agents and humans.

Reading         passage, search, compare
Originals       interlinear, original, lemma, word, morph, grep-morph
Analysis        xref, freq, cooccur
Introspection   books, translations, editions, licenses, morph-codes, ref
Infra           db, mcp, agent-setup

All commands accept --json for machine-readable output and exit non-zero on
errors with a helpful message. References are forgiving: "John 3:16-18",
"jn 3 16", "1jn2:5", "Psalm 23", "Gen 1:1-2:3" all work.`,
  )
  .version('0.1.0');

registerReadCommands(program);
registerOriginalCommands(program);
registerAnalysisCommands(program);
registerDiscoverCommands(program);
registerInfoCommands(program);
registerAgentCommands(program);

program
  .command('mcp')
  .description('Run as an MCP (Model Context Protocol) server over stdio')
  .action(async () => {
    const { runMcpServer } = await import('./mcp/server.js');
    await runMcpServer();
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

void main();
