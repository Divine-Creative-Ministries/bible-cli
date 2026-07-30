import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type DatabaseT from 'better-sqlite3';

/**
 * Native-driver selection with a crash-proof probe.
 *
 * better-sqlite3 v13 ships bundled prebuilds that require newer glibc on some
 * Linux platforms; where they are incompatible the failure can be a hard
 * SIGSEGV at first database open — which an in-process try/catch can never
 * survive (this took down the CLI inside ChatGPT/Codex sandboxes, exit 139).
 * So the first run probes each candidate driver in a THROWAWAY CHILD PROCESS
 * and caches which one works; the parent only ever loads a driver that has
 * already proven itself. Cached per node-ABI in ~/.bible-cli.
 *
 * Override with BIBLE_CLI_SQLITE_DRIVER=better-sqlite3|better-sqlite3-v12.
 */

const req = createRequire(import.meta.url);
const CANDIDATES = ['better-sqlite3', 'better-sqlite3-v12'];

export class DriverError extends Error {}

interface Marker {
  driver: string;
  abi: string;
  node: string;
  entry: string; // resolved path of the probed binary's package entry
  version: string;
}

function versionOf(pkg: string): string {
  try {
    return (req(`${pkg}/package.json`) as { version: string }).version;
  } catch {
    return 'unknown';
  }
}

function markerPath(): string {
  return path.join(os.homedir(), '.bible-cli', '.native-driver.json');
}

function probeWorks(pkg: string): boolean {
  let entry: string;
  try {
    entry = req.resolve(pkg);
  } catch {
    return false; // not installed (optional dep may have been skipped)
  }
  const code = `const D=require(${JSON.stringify(entry)});const d=new D(':memory:');d.prepare('SELECT 1 x').get();d.close();`;
  const r = spawnSync(process.execPath, ['-e', code], { stdio: 'ignore', timeout: 20000 });
  return r.status === 0;
}

function platformDetail(): string {
  let glibc = '';
  try {
    const rep = (process.report?.getReport() as { header?: { glibcVersionRuntime?: string } })?.header;
    if (rep?.glibcVersionRuntime) glibc = `, glibc ${rep.glibcVersionRuntime}`;
  } catch {
    // no report available
  }
  return `${process.platform}-${process.arch}, node ${process.version}${glibc}`;
}

let loaded: { name: string; ctor: typeof DatabaseT } | null = null;

/** Which driver is active (loads it if needed). Exposed for `bible doctor`. */
export function driverInfo(): { name: string; version: string } {
  loadDriver();
  let version = 'unknown';
  try {
    version = (req(`${loaded!.name}/package.json`) as { version: string }).version;
  } catch {
    // version stays unknown
  }
  return { name: loaded!.name, version };
}

export function loadDriver(): typeof DatabaseT {
  if (loaded) return loaded.ctor;

  const forced = process.env.BIBLE_CLI_SQLITE_DRIVER;
  if (forced) {
    try {
      loaded = { name: forced, ctor: req(req.resolve(forced)) as typeof DatabaseT };
      return loaded.ctor;
    } catch (e) {
      throw new DriverError(`BIBLE_CLI_SQLITE_DRIVER='${forced}' could not be loaded: ${(e as Error).message}`);
    }
  }

  // Fast path: a previously probed driver — but only when the marker refers
  // to the SAME binary (resolved path + version + node ABI). An npm upgrade,
  // rebuild, or a different installation sharing this home directory must
  // fall through to a fresh child-process probe, or a cached "works" verdict
  // could reintroduce the parent-process SIGSEGV this file exists to prevent.
  const mp = markerPath();
  try {
    const m = JSON.parse(fs.readFileSync(mp, 'utf8')) as Marker;
    if (
      m.abi === process.versions.modules &&
      CANDIDATES.includes(m.driver) &&
      m.entry === req.resolve(m.driver) &&
      m.version === versionOf(m.driver)
    ) {
      loaded = { name: m.driver, ctor: req(m.entry) as typeof DatabaseT };
      return loaded.ctor;
    }
  } catch {
    // no/stale marker, or the cached driver disappeared — reprobe below
  }

  for (const pkg of CANDIDATES) {
    if (probeWorks(pkg)) {
      try {
        fs.mkdirSync(path.dirname(mp), { recursive: true });
        fs.writeFileSync(
          mp,
          JSON.stringify({
            driver: pkg,
            abi: process.versions.modules,
            node: process.version,
            entry: req.resolve(pkg),
            version: versionOf(pkg),
          } satisfies Marker),
        );
      } catch {
        // caching is best-effort
      }
      loaded = { name: pkg, ctor: req(req.resolve(pkg)) as typeof DatabaseT };
      return loaded.ctor;
    }
  }

  throw new DriverError(
    `No working SQLite driver on this platform (${platformDetail()}). ` +
      `The bundled better-sqlite3 binary is incompatible here (often an older glibc). ` +
      `Fix (needs python3 + make + a C++ compiler): on Node >= 22 run ` +
      `'npm rebuild better-sqlite3 --build-from-source'; on Node 20 rebuild the fallback instead: ` +
      `'npm rebuild better-sqlite3-v12 --build-from-source' (better-sqlite3 v13 needs Node >= 22). ` +
      `Then re-run. Diagnose with 'bible doctor'.`,
  );
}
