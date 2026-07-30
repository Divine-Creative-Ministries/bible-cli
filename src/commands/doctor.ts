import * as fs from 'node:fs';
import type { Command } from 'commander';
import { corePath, DATA_VERSION, dataDir, lxxPath, studyPath, userPath } from '../db/index.js';
import { driverInfo, loadDriver } from '../db/driver.js';
import { emit, table } from '../output.js';

/**
 * bible doctor — environment and data diagnostics. Designed to still produce
 * useful output when the native SQLite driver itself is broken (the failure
 * that motivated it), so nothing here assumes a working database.
 */

type Status = 'ok' | 'warn' | 'fail';
interface Check {
  check: string;
  status: Status;
  detail: string;
  advice?: string;
}

function glibcVersion(): string | null {
  try {
    const h = (process.report?.getReport() as { header?: { glibcVersionRuntime?: string } })?.header;
    return h?.glibcVersionRuntime ?? null;
  } catch {
    return null;
  }
}

export function runDoctor(): { checks: Check[]; failed: boolean } {
  const checks: Check[] = [];
  const add = (check: string, status: Status, detail: string, advice?: string): void => {
    checks.push({ check, status, detail, ...(advice ? { advice } : {}) });
  };

  // environment
  const glibc = glibcVersion();
  add('platform', 'ok', `${process.platform}-${process.arch}, node ${process.version}${glibc ? `, glibc ${glibc}` : ''}`);
  const envs = ['BIBLE_CLI_DATA', 'BIBLE_TRANSLATION', 'BIBLE_CLI_NO_AUTO_DOWNLOAD', 'BIBLE_CLI_RELEASE_BASE', 'BIBLE_CLI_SQLITE_DRIVER']
    .filter((k) => process.env[k])
    .map((k) => `${k}=${process.env[k]}`);
  add('env overrides', 'ok', envs.length ? envs.join(' ') : 'none');
  add('data pin', 'ok', DATA_VERSION);

  // native driver — the check that motivated this command
  let db: import('better-sqlite3').Database | null = null;
  let driverOk = false;
  try {
    const info = driverInfo();
    add('sqlite driver', 'ok', `${info.name} ${info.version} (probed in a child process)`);
    driverOk = true;
  } catch (e) {
    add('sqlite driver', 'fail', (e as Error).message);
  }

  // data directory
  const dir = dataDir();
  const dirExists = fs.existsSync(dir);
  let writable = false;
  if (dirExists) {
    try {
      fs.accessSync(dir, fs.constants.W_OK);
      writable = true;
    } catch {
      writable = false;
    }
  }
  add(
    'data dir',
    dirExists ? (writable ? 'ok' : 'warn') : 'warn',
    `${dir}${dirExists ? (writable ? '' : ' (not writable)') : ' (missing — created on first download)'}`,
  );

  // artifacts
  const artifacts: Array<{ name: string; p: string; required: boolean; sanity: (d: import('better-sqlite3').Database) => string | null }> = [
    {
      name: 'bible-core.db',
      p: corePath(),
      required: true,
      sanity: (d) => {
        // ~31,102 numbered verses (KJV base) + superscription rows + spine-union extras
        const n = (d.prepare('SELECT COUNT(*) n FROM verses WHERE verse_id % 1000 != 0').get() as { n: number }).n;
        if (Math.abs(n - 31102) > 25) return `verse spine has ${n} numbered rows (expected ~31102)`;
        const fts = (d.prepare("SELECT COUNT(*) n FROM verse_fts WHERE verse_fts MATCH 'love'").get() as { n: number }).n;
        if (fts === 0) return 'full-text index returned no hits for a common word';
        return null;
      },
    },
    {
      name: 'bible-study.db',
      p: studyPath(),
      required: false,
      sanity: (d) => {
        const n = (d.prepare('SELECT COUNT(*) n FROM words WHERE is_default = 1').get() as { n: number }).n;
        return n > 400000 ? null : `words table has only ${n} default-stream rows`;
      },
    },
    { name: 'bible-lxx.db', p: lxxPath(), required: false, sanity: () => null },
    { name: 'bible-user.db', p: userPath(), required: false, sanity: () => null },
  ];
  for (const a of artifacts) {
    if (!fs.existsSync(a.p)) {
      if (a.name === 'bible-user.db') continue; // purely optional, silence is fine
      add(
        a.name,
        a.required ? 'warn' : 'ok',
        'not downloaded',
        a.required ? `Run 'bible db download' (or just run any reading command — it self-provisions).` : undefined,
      );
      continue;
    }
    const mb = (fs.statSync(a.p).size / 1048576).toFixed(1);
    if (!driverOk) {
      // Without a working driver the files were never examined — do NOT
      // suggest deleting data that may be perfectly fine.
      add(a.name, 'warn', `${mb} MB — check skipped (no working SQLite driver)`);
      continue;
    }
    try {
      db = new (loadDriver())(a.p, { readonly: true, fileMustExist: true });
      const meta = db.prepare("SELECT value FROM meta WHERE key = 'artifact'").get() as { value: string } | undefined;
      const quick = db.prepare('PRAGMA quick_check').get() as { quick_check: string };
      const schemaVer = (db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value: string } | undefined)?.value ?? '1';
      const sanity = quick.quick_check === 'ok' ? a.sanity(db) : `integrity: ${quick.quick_check}`;
      db.close();
      db = null;
      if (sanity) add(a.name, 'fail', `${mb} MB — ${sanity}`, `Delete the file and re-run 'bible db download'.`);
      else add(a.name, 'ok', `${mb} MB, artifact=${meta?.value ?? '?'}, schema v${schemaVer}, integrity ok`);
    } catch (e) {
      if (db) {
        try {
          db.close();
        } catch {
          // already broken
        }
        db = null;
      }
      add(a.name, 'fail', `${mb} MB — cannot open: ${(e as Error).message}`, `Delete the file and re-run 'bible db download'.`);
    }
  }

  return { checks, failed: checks.some((c) => c.status === 'fail') };
}

export function registerDoctorCommand(program: Command): void {
  program
    .command('doctor')
    .description('Diagnose the installation: platform, native SQLite driver, databases, integrity. Run this first when anything misbehaves.')
    .option('--json', 'output JSON')
    .action((opts: { json?: boolean }) => {
      const { checks, failed } = runDoctor();
      emit(opts, { ok: !failed, checks }, () =>
        table(checks.map((c) => [c.status === 'ok' ? '✓' : c.status === 'warn' ? '~' : '✗', c.check, c.detail + (c.advice ? `\n    → ${c.advice}` : '')])),
      );
      if (failed) process.exitCode = 1;
    });
}
