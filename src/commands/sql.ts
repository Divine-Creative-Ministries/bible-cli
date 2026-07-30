import type { Command } from 'commander';
import { hasUserDb, openCore, openLxx, openStudy, openSyntax } from '../db/index.js';
import { emit, fail, table } from '../output.js';
import { intOpt } from './read.js';

/**
 * Open the core db read-only and attach whatever optional databases exist.
 * Returns the connection plus the list of attached schema names.
 */
function openAll(): { db: import('better-sqlite3').Database; databases: Array<{ name: string; schema: string }> } {
  const db = openCore();
  const databases: Array<{ name: string; schema: string }> = [{ name: 'core', schema: 'main' }];
  try {
    openStudy();
    databases.push({ name: 'study', schema: 'study' });
  } catch {
    // study db not installed — core-only queries still work
  }
  try {
    openLxx();
    databases.push({ name: 'lxx', schema: 'lxx' });
  } catch {
    // optional LXX db not installed
  }
  try {
    openSyntax();
    databases.push({ name: 'syntax', schema: 'syntax' });
  } catch {
    // optional syntax db not installed
  }
  if (hasUserDb()) databases.push({ name: 'user', schema: 'user' });
  return { db, databases };
}

const SCHEMA_NOTES = [
  'verse_id encodes book*1e6 + chapter*1e3 + verse (BBCCCVVV); verse 0 is a Psalm-title superscription.',
  "study.words has one row per morpheme; analytics must filter is_default = 1 (the Qere / NA-stream Greek reading stream) to avoid double counting.",
  'FTS5 tables (verse_fts, verse_fts_stem, lexicon_fts) are queried with: SELECT ... FROM <table> WHERE <table> MATCH ?.',
];

export function registerSqlCommands(program: Command): void {
  program
    .command('sql')
    .description(
      "Run a read-only SQL query against the scripture databases (core, plus study/lxx/user when installed, attached under those schema names). Discover tables with 'bible schema'. Example: bible sql \"SELECT COUNT(*) n FROM verses\"",
    )
    .argument('<query>', 'a single read-only SQL statement (SELECT / WITH ... SELECT)')
    .option('-l, --limit <n>', 'max rows returned (default 200)', intOpt, 200)
    .option('--json', 'output JSON')
    .action((query: string, opts: { limit: number; json?: boolean }) => {
      const { db, databases } = openAll();
      // Defense in depth on top of the read-only connection: query_only
      // rejects any write at the SQLite level for this process.
      try {
        db.pragma('query_only = ON');
      } catch {
        // ignore — the connection itself is already read-only
      }
      let stmt: import('better-sqlite3').Statement;
      try {
        stmt = db.prepare(query);
      } catch (e) {
        fail(opts, `SQL error: ${(e as Error).message}. Inspect the schema with 'bible schema'; FTS tables are queried with \"<table> MATCH ?\".`);
      }
      // stmt.readonly rejects mutating statements that still return rows
      // (DELETE ... RETURNING, write-capable PRAGMAs); stmt.reader rejects
      // statements that return nothing.
      if (!stmt.readonly || !stmt.reader) {
        fail(opts, 'Only read-only queries that return rows are allowed (SELECT / WITH ... SELECT). The databases are opened read-only.');
      }
      const columns = stmt.columns().map((c) => c.name);
      const rows: Array<Record<string, unknown>> = [];
      let truncated = false;
      try {
        for (const row of stmt.iterate()) {
          if (rows.length >= opts.limit) {
            truncated = true;
            break;
          }
          rows.push(row as Record<string, unknown>);
        }
      } catch (e) {
        fail(opts, `SQL error: ${(e as Error).message}.`);
      }
      emit(
        opts,
        {
          columns,
          rows,
          row_count: rows.length,
          truncated,
          ...(truncated ? { hint: `Only the first ${opts.limit} rows are shown; raise --limit or aggregate in SQL.` } : {}),
          databases: databases.map((d) => d.name),
        },
        () => {
          if (rows.length === 0) return 'no rows';
          const body =
            rows.length <= 50
              ? table([columns, ...rows.map((r) => columns.map((c) => (r[c] === null || r[c] === undefined ? '' : String(r[c]))))])
              : JSON.stringify({ columns, rows }, null, 2);
          return body + `\n(${rows.length} row${rows.length === 1 ? '' : 's'}${truncated ? `; truncated at --limit ${opts.limit}` : ''})`;
        },
      );
    });

  program
    .command('schema')
    .description("Show CREATE TABLE statements for the scripture databases (core + attached study/lxx/user), plus notes on verse-id encoding and query conventions. Example: bible schema words")
    .argument('[table]', 'show only this table (searched across all attached databases)')
    .option('--json', 'output JSON')
    .action((tableArg: string | undefined, opts: { json?: boolean }) => {
      const { db, databases } = openAll();
      const out = databases.map(({ name, schema }) => {
        const all = db
          .prepare(`SELECT name, sql FROM ${schema}.sqlite_master WHERE type = 'table' AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY name`)
          .all() as Array<{ name: string; sql: string }>;
        // Hide FTS5 shadow tables (<fts>_data, <fts>_idx, ...) behind their virtual table.
        const virtual = new Set(all.filter((t) => /^CREATE VIRTUAL TABLE/i.test(t.sql)).map((t) => t.name));
        let tables = all.filter((t) => {
          const m = t.name.match(/^(.*)_(config|content|data|docsize|idx)$/);
          return !(m && virtual.has(m[1]!));
        });
        if (tableArg) tables = tables.filter((t) => t.name.toLowerCase() === tableArg.toLowerCase());
        return { name, tables };
      });
      if (tableArg && out.every((d) => d.tables.length === 0)) {
        const names = databases
          .map(({ name, schema }) => {
            const list = (db.prepare(`SELECT name FROM ${schema}.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`).all() as Array<{ name: string }>)
              .map((t) => t.name)
              .filter((n) => !/_(config|content|data|docsize|idx)$/.test(n));
            return `${name}: ${list.join(', ')}`;
          })
          .join('\n  ');
        fail(opts, `No table named '${tableArg}'. Available tables:\n  ${names}`);
      }
      emit(opts, { databases: out, notes: SCHEMA_NOTES }, () =>
        [
          ...out
            .filter((d) => d.tables.length > 0)
            .map((d) => [`-- database: ${d.name}`, ...d.tables.map((t) => `${t.sql.trim().replace(/;\s*$/, '')};`)].join('\n\n')),
          'Notes:\n' + SCHEMA_NOTES.map((n) => `- ${n}`).join('\n'),
        ].join('\n\n'),
      );
    });
}
