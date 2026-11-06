/**
 * Build the BSB alignment + mobile data packs against existing core/study
 * databases. Standalone, like build-syntax.ts.
 *
 * Inputs:
 *   <data>/bible-core.db, <data>/bible-study.db   data/dist, or BIBLE_CLI_DATA
 *   .cache/raw/berean/bsb_tables.tsv               (pipeline/download.sh)
 * Outputs (data/dist/mobile/):
 *   bible-align.db                 alignment tables (merged into bible-study.db
 *                                  at the next data release)
 *   bible-mobile-{BSB,KJV,WEB,ASV}.db, bible-mobile-xref.db, bible-mobile-originals.db
 *   mobile-manifest.json           sizes (raw + gzip -9) and sha256 per pack
 *
 * Usage: npx tsx pipeline/build-mobile.ts
 */
import Database from 'better-sqlite3';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { DIST, RAW, log, sha256 } from './lib.js';
import { stageAlignment, verifyAlignment } from './stages/alignment.js';
import { MOBILE_TRANSLATIONS, buildOriginalsPack, buildTranslationPack, buildXrefPack } from './stages/mobile.js';

const dataDir = process.env.BIBLE_CLI_DATA ?? DIST;
const core = path.join(dataDir, 'bible-core.db');
const study = path.join(dataDir, 'bible-study.db');
const tsv = path.join(RAW, 'berean', 'bsb_tables.tsv');
const outDir = path.join(DIST, 'mobile');

for (const f of [core, study, tsv]) {
  if (!fs.existsSync(f)) {
    console.error(`missing input: ${f}`);
    process.exit(1);
  }
}
fs.mkdirSync(outDir, { recursive: true });

// ---- alignment ----
const alignPath = path.join(outDir, 'bible-align.db');
fs.rmSync(alignPath, { force: true });
const out = new Database(alignPath);
out.pragma('journal_mode = OFF');
out.pragma('synchronous = OFF');
const coreDb = new Database(core, { readonly: true });
const studyDb = new Database(study, { readonly: true });
log('alignment: parsing BSB tables');
const t0 = Date.now();
const stats = stageAlignment({ tsvPath: tsv, core: coreDb, study: studyDb, out });
const pct = (a: number, b: number) => ((100 * a) / b).toFixed(2) + '%';
log(
  `alignment: ${stats.verses} verses (${stats.versesUnparsed} unparsed, ${stats.versesMissingText} without BSB text) in ${((Date.now() - t0) / 1000).toFixed(1)}s\n` +
    `  Hebrew/Aramaic words ${stats.words.H}, matched ${pct(stats.words.matched.H, stats.words.H)}\n` +
    `  Greek words ${stats.words.G}, matched ${pct(stats.words.matched.G, stats.words.G)}\n` +
    `  match kinds ${JSON.stringify(stats.words.byMatch)}\n` +
    `  rendering kinds ${JSON.stringify(stats.kinds)}\n` +
    `  BSB verses fully rebuilt from spans: ${pct(stats.rebuild.exact, stats.rebuild.verses)}`,
);
const sha = sha256(tsv);
out.prepare(`INSERT OR REPLACE INTO meta VALUES ('bsb_tables_sha256', ?)`).run(sha);
const bsbVerse = coreDb.prepare(`SELECT text FROM verse_texts WHERE translation_id='BSB' AND verse_id=?`);
const problems = verifyAlignment(out, stats, (id) => (bsbVerse.get(id) as { text: string } | undefined)?.text ?? '');
out.exec('ANALYZE');
out.close();
// Invariant gate: never ship packs past a failed check — fix the stage instead.
if (problems.length) {
  console.error('alignment verify FAILED:\n  ' + problems.join('\n  '));
  process.exit(1);
}

// ---- packs ----
const inp = { core, study, align: alignPath, outDir };
const files: string[] = [];
for (const tr of MOBILE_TRANSLATIONS) {
  log(`pack: ${tr}`);
  files.push(buildTranslationPack(inp, tr));
}
log('pack: xref');
files.push(buildXrefPack(inp));
log('pack: originals');
files.push(buildOriginalsPack(inp));

// ---- sizes ----
const mb = (n: number) => (n / 1024 / 1024).toFixed(1) + ' MB';
const manifest: Record<string, { bytes: number; gzip_bytes: number; sha256: string }> = {};
console.log('\npack                              on disk      gzip -9');
for (const f of files) {
  const buf = fs.readFileSync(f);
  const gz = zlib.gzipSync(buf, { level: 9 });
  fs.writeFileSync(f + '.gz', gz);
  manifest[path.basename(f)] = { bytes: buf.length, gzip_bytes: gz.length, sha256: createHash('sha256').update(buf).digest('hex') };
  console.log(`${path.basename(f).padEnd(32)} ${mb(buf.length).padStart(9)}  ${mb(gz.length).padStart(9)}`);
}
fs.writeFileSync(path.join(outDir, 'mobile-manifest.json'), JSON.stringify({ schema_version: 1, built_at: new Date().toISOString(), bsb_tables_sha256: sha, packs: manifest }, null, 2) + '\n');
