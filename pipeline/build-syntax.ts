/**
 * Build the bible-syntax.db artifact (MACULA clause syntax) against an
 * existing core database. Standalone, mirroring rebuild-lxx.ts.
 *
 * Inputs (all under .cache/raw/):
 *   macula/hebrew-git/WLC/lowfat/     sparse checkout of Clear-Bible/macula-hebrew
 *                                     pinned at 47db250bd55d0d8577f2a94fba114ef16c35b23c
 *   macula/greek-git/SBLGNT/lowfat/   sparse checkout of Clear-Bible/macula-greek
 *                                     pinned at 8423afe47b9e8f24b7772e808af45c7159a6fe7e
 *   stepbible/TAHOT-*.txt, TAGNT-*.txt  (pipeline/download.sh) for versification
 *
 * Fetch the MACULA inputs with: bash pipeline/download-macula.sh
 *
 * Usage: npx tsx pipeline/build-syntax.ts
 */
import Database from 'better-sqlite3';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { DIST, ROOT, log } from './lib.js';
import { stageSyntax, verifySyntax } from './stages/syntax.js';

const MACULA_HEBREW_COMMIT = '47db250bd55d0d8577f2a94fba114ef16c35b23c';
const MACULA_GREEK_COMMIT = '8423afe47b9e8f24b7772e808af45c7159a6fe7e';

const SOURCES = [
  {
    id: 'macula-hebrew',
    title: 'MACULA Hebrew Linguistic Datasets (WLC syntax trees)',
    url: 'https://github.com/Clear-Bible/macula-hebrew/',
    version: MACULA_HEBREW_COMMIT,
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    attribution:
      'MACULA Hebrew Linguistic Datasets, available at https://github.com/Clear-Bible/macula-hebrew/ — (C) 2022-2024 Biblica, Inc, CC BY 4.0. Westminster trees (C) J. Alan Groves Center (CC BY 4.0); base text: Westminster Leningrad Codex (tanach.us, unrestricted).',
  },
  {
    id: 'macula-greek',
    title: 'MACULA Greek Linguistic Datasets (SBLGNT syntax trees)',
    url: 'https://github.com/Clear-Bible/macula-greek/',
    version: MACULA_GREEK_COMMIT,
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    attribution:
      'MACULA Greek Linguistic Datasets, available at https://github.com/Clear-Bible/macula-greek/ — (C) 2022-2024 Biblica, Inc, CC BY 4.0.',
  },
  {
    id: 'sblgnt',
    title: 'SBL Greek New Testament (base text of the MACULA Greek trees)',
    url: 'https://github.com/LogosBible/SBLGNT',
    version: null as string | null,
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    attribution: 'SBLGNT, edited by Michael W. Holmes — Logos Bible Software and the Society of Biblical Literature, CC BY 4.0.',
  },
  {
    id: 'stepbible-versification',
    title: 'STEPBible TAHOT/TAGNT alternate references (versification mapping only)',
    url: 'https://github.com/STEPBible/STEPBible-Data',
    version: null as string | null,
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    attribution: 'Native-tradition to English-spine verse mapping derived from TAHOT/TAGNT data created by www.STEPBible.org based on work at Tyndale House Cambridge (CC BY 4.0).',
  },
];

const corePath = path.join(DIST, 'bible-core.db');
if (!fs.existsSync(corePath)) {
  throw new Error(`bible-core.db not found in ${DIST} — run the main pipeline first (npm run pipeline).`);
}
const core = new Database(corePath, { readonly: true });
const finalPath = path.join(DIST, 'bible-syntax.db');
const tmp = finalPath + '.tmp';
fs.rmSync(tmp, { force: true });
const db = new Database(tmp);
db.exec(fs.readFileSync(path.join(ROOT, 'pipeline', 'schema', 'syntax.sql'), 'utf8'));

const insMeta = db.prepare('INSERT INTO meta (key,value) VALUES (?,?)');
insMeta.run('schema_version', '1');
insMeta.run('artifact', 'syntax');
insMeta.run('build_date', new Date().toISOString());
insMeta.run('macula_hebrew_commit', MACULA_HEBREW_COMMIT);
insMeta.run('macula_greek_commit', MACULA_GREEK_COMMIT);
const insSource = db.prepare(
  'INSERT INTO sources (source_id,title,url,version,retrieved_at,license,license_url,attribution) VALUES (?,?,?,?,?,?,?,?)',
);
for (const s of SOURCES) {
  insSource.run(s.id, s.title, s.url, s.version, new Date().toISOString().slice(0, 10), s.license, s.licenseUrl, s.attribution);
}

stageSyntax(db, core);
verifySyntax(db, core);

for (const t of ['clauses', 'clause_roles'] as const) {
  const n = (db.prepare(`SELECT COUNT(*) n FROM ${t}`).get() as { n: number }).n;
  log(`${t}: ${n} rows`);
}
db.exec('PRAGMA optimize');
db.exec('PRAGMA journal_mode = DELETE');
db.exec('VACUUM');
db.close();
core.close();
fs.renameSync(tmp, finalPath);
const mb = (fs.statSync(finalPath).size / 1024 / 1024).toFixed(1);
log(`wrote ${finalPath} (${mb} MB)`);
