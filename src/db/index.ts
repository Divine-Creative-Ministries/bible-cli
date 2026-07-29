import Database from 'better-sqlite3';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Release location for prebuilt databases (gzip-compressed artifacts). */
const RELEASE_BASE =
  process.env.BIBLE_CLI_RELEASE_BASE ??
  'https://github.com/baileytownsend/bible-cli/releases/latest/download';

export function dataDir(): string {
  if (process.env.BIBLE_CLI_DATA) return process.env.BIBLE_CLI_DATA;
  const dev = path.join(PKG_ROOT, 'data', 'dist');
  if (fs.existsSync(path.join(dev, 'bible-core.db'))) return dev;
  return path.join(os.homedir(), '.bible-cli');
}

export class DataError extends Error {}

let coreDb: Database.Database | null = null;
let studyAttached = false;

export function corePath(): string {
  return path.join(dataDir(), 'bible-core.db');
}
export function studyPath(): string {
  return path.join(dataDir(), 'bible-study.db');
}

export async function downloadArtifact(which: 'core' | 'study'): Promise<void> {
  const dest = which === 'core' ? corePath() : studyPath();
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const url = `${RELEASE_BASE}/bible-${which}.db.gz`;
  process.stderr.write(`Downloading ${url} ...\n`);
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new DataError(
      `Download failed (${res.status}) for ${url}. ` +
        `You can build the databases locally with 'npm run pipeline' in the bible-cli repo, ` +
        `then set BIBLE_CLI_DATA to the data/dist directory.`,
    );
  }
  const { createGunzip } = await import('node:zlib');
  const { pipeline } = await import('node:stream/promises');
  const { Readable } = await import('node:stream');
  const tmp = dest + '.tmp';
  await pipeline(Readable.fromWeb(res.body as never), createGunzip(), fs.createWriteStream(tmp));
  fs.renameSync(tmp, dest);
  process.stderr.write(`Saved ${dest}\n`);
}

/** Open the core database (read-only). Fails with a helpful message if missing. */
export function openCore(): Database.Database {
  if (coreDb) return coreDb;
  const p = corePath();
  if (!fs.existsSync(p)) {
    throw new DataError(
      `Database not found at ${p}. Run 'bible db download' to fetch it (about 25 MB), ` +
        `or set BIBLE_CLI_DATA to a directory containing bible-core.db.`,
    );
  }
  coreDb = new Database(p, { readonly: true, fileMustExist: true });
  return coreDb;
}

/** Ensure the study database (originals + lexicons) is attached as 'study'. */
export function openStudy(): Database.Database {
  const db = openCore();
  if (studyAttached) return db;
  const p = studyPath();
  if (!fs.existsSync(p)) {
    throw new DataError(
      `Original-language database not found at ${p}. Run 'bible db download' to fetch it ` +
        `(about 70 MB); it is needed for lemma/morphology/lexicon/interlinear commands.`,
    );
  }
  db.exec(`ATTACH DATABASE '${p.replace(/'/g, "''")}' AS study`);
  studyAttached = true;
  return db;
}

export function dbStatus(): { dir: string; core: boolean; study: boolean; coreMb?: string; studyMb?: string } {
  const dir = dataDir();
  const c = corePath();
  const s = studyPath();
  const st: ReturnType<typeof dbStatus> = {
    dir,
    core: fs.existsSync(c),
    study: fs.existsSync(s),
  };
  if (st.core) st.coreMb = (fs.statSync(c).size / 1048576).toFixed(1);
  if (st.study) st.studyMb = (fs.statSync(s).size / 1048576).toFixed(1);
  return st;
}
