import Database from 'better-sqlite3';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Data release pin: databases are downloaded from this exact release tag so a
 * given CLI version always gets schema-compatible data. Override with
 * BIBLE_CLI_RELEASE_BASE for mirrors or testing.
 */
export const DATA_VERSION = 'data-v0.1.3';
const IS_OFFICIAL_BASE = !process.env.BIBLE_CLI_RELEASE_BASE;
const RELEASE_BASE =
  process.env.BIBLE_CLI_RELEASE_BASE ??
  `https://github.com/Divine-Creative-Ministries/bible-cli/releases/download/${DATA_VERSION}`;

export function dataDir(): string {
  if (process.env.BIBLE_CLI_DATA) return process.env.BIBLE_CLI_DATA;
  const dev = path.join(PKG_ROOT, 'data', 'dist');
  if (fs.existsSync(path.join(dev, 'bible-core.db'))) return dev;
  return path.join(os.homedir(), '.bible-cli');
}

export class DataError extends Error {}

let coreDb: Database.Database | null = null;
let studyAttached = false;
let lxxAttached = false;

export function corePath(): string {
  return path.join(dataDir(), 'bible-core.db');
}
export function studyPath(): string {
  return path.join(dataDir(), 'bible-study.db');
}
export function lxxPath(): string {
  return path.join(dataDir(), 'bible-lxx.db');
}

export async function downloadArtifact(which: 'core' | 'study' | 'lxx'): Promise<void> {
  const dest = which === 'core' ? corePath() : which === 'study' ? studyPath() : lxxPath();
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
  const { createHash } = await import('node:crypto');
  const tmp = dest + '.tmp';
  const hash = createHash('sha256');
  const { Transform } = await import('node:stream');
  const tap = new Transform({
    transform(chunk, _enc, cb) {
      hash.update(chunk as Buffer);
      cb(null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(res.body as never), tap, createGunzip(), fs.createWriteStream(tmp));
  // Verify the compressed artifact's sha256 against the release manifest.
  // The official release base fails closed: a missing/invalid manifest aborts
  // the install. Custom mirrors (BIBLE_CLI_RELEASE_BASE) may omit a manifest;
  // the SQLite integrity check below still applies to them.
  {
    const actual = hash.digest('hex');
    let expected: string | undefined;
    let manifestError: string | null = null;
    try {
      const manifestRes = await fetch(`${RELEASE_BASE}/manifest.json`);
      if (!manifestRes.ok) manifestError = `manifest fetch failed (${manifestRes.status})`;
      else {
        const manifest = (await manifestRes.json()) as { files?: Record<string, { sha256?: string }> };
        expected = manifest.files?.[`bible-${which}.db.gz`]?.sha256;
        if (!/^[0-9a-f]{64}$/.test(expected ?? '')) manifestError = 'manifest has no valid sha256 for this file';
      }
    } catch (e) {
      manifestError = `manifest unreadable: ${(e as Error).message}`;
    }
    if (manifestError && IS_OFFICIAL_BASE) {
      fs.rmSync(tmp, { force: true });
      throw new DataError(`Cannot verify download: ${manifestError}. Aborting install.`);
    }
    if (expected && expected !== actual) {
      fs.rmSync(tmp, { force: true });
      throw new DataError(`Checksum mismatch for bible-${which}.db.gz (expected ${expected}, got ${actual}).`);
    }
  }
  // Sanity-check before installing: valid SQLite file of the expected artifact.
  try {
    const check = new Database(tmp, { readonly: true, fileMustExist: true });
    const meta = check.prepare('SELECT value FROM meta WHERE key = ?').get('artifact') as { value: string } | undefined;
    const ok = check.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
    check.close();
    if (meta?.value !== which || ok.integrity_check !== 'ok') {
      throw new DataError(`downloaded file failed validation (artifact=${meta?.value}, integrity=${ok.integrity_check})`);
    }
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    if (e instanceof DataError) throw e;
    throw new DataError(`Downloaded ${which} database is not a valid bible-cli artifact: ${(e as Error).message}`);
  }
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

/** Attach the optional LXX database (CC BY-SA artifact with quotations). */
export function openLxx(): Database.Database {
  const db = openCore();
  if (lxxAttached) return db;
  const p = lxxPath();
  if (!fs.existsSync(p)) {
    throw new DataError(
      `Septuagint database not found at ${p}. Run 'bible db download-lxx' to fetch it. ` +
        `Note: unlike the core/study databases (public domain + CC BY), the LXX artifact ` +
        `is licensed CC BY-SA 4.0 (the Swete digitization's license).`,
    );
  }
  db.exec(`ATTACH DATABASE '${p.replace(/'/g, "''")}' AS lxx`);
  lxxAttached = true;
  return db;
}

export function dbStatus(): { dir: string; data_version: string; core: boolean; study: boolean; lxx: boolean; coreMb?: string; studyMb?: string; lxxMb?: string } {
  const dir = dataDir();
  const c = corePath();
  const s = studyPath();
  const l = lxxPath();
  const st: ReturnType<typeof dbStatus> = {
    dir,
    data_version: DATA_VERSION,
    core: fs.existsSync(c),
    study: fs.existsSync(s),
    lxx: fs.existsSync(l),
  };
  if (st.core) st.coreMb = (fs.statSync(c).size / 1048576).toFixed(1);
  if (st.study) st.studyMb = (fs.statSync(s).size / 1048576).toFixed(1);
  if (st.lxx) st.lxxMb = (fs.statSync(l).size / 1048576).toFixed(1);
  return st;
}

/**
 * First-run self-provisioning: download whichever required databases are
 * missing, with a clear notice. The LXX artifact is never auto-downloaded
 * (CC BY-SA licensing is opt-in via 'bible db download-lxx').
 */
export async function autoProvision(needsCore: boolean, needsStudy: boolean): Promise<void> {
  const missingCore = needsCore && !fs.existsSync(corePath());
  const missingStudy = needsStudy && !fs.existsSync(studyPath());
  if (!missingCore && !missingStudy) return;
  process.stderr.write(
    `First run: downloading scripture database${missingCore && missingStudy ? 's' : ''} to ${dataDir()} (one-time).\n`,
  );
  if (missingCore) await downloadArtifact('core');
  if (missingStudy) await downloadArtifact('study');
}
