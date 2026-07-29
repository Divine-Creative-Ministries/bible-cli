/**
 * Build orchestrator: raw sources in .cache/raw -> data/dist/bible-core.db + bible-study.db
 * Usage: npm run pipeline [-- --only core|study]
 */
import Database from 'better-sqlite3';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { DIST, ROOT, log } from './lib.js';
import { stageTranslations, stageFts } from './stages/translations.js';
import { stageHebrewWords, stageGreekWords } from './stages/words.js';
import { stageBsbInterlinear } from './stages/interlinear.js';
import { stageLexicons } from './stages/lexicons.js';
import { stageCrossRefs } from './stages/crossrefs.js';
import { verifyCore, verifyStudy } from './stages/verify.js';

const SCHEMA_VERSION = '1';

interface SourceRow {
  id: string;
  title: string;
  url: string;
  license: string;
  licenseUrl: string;
  attribution: string;
}

const SOURCES: SourceRow[] = [
  {
    id: 'ebible-web',
    title: 'World English Bible (WEB)',
    url: 'https://ebible.org/find/show.php?id=eng-web',
    license: 'Public Domain',
    licenseUrl: 'https://worldenglish.bible/',
    attribution: 'World English Bible (WEB), public domain. "World English Bible" is a trademark of eBible.org.',
  },
  {
    id: 'ebible-kjv',
    title: 'King James Version (KJV, 1769 text)',
    url: 'https://ebible.org/find/show.php?id=eng-kjv2006',
    license: 'Public Domain',
    licenseUrl: 'https://ebible.org/',
    attribution: 'King James Version, public domain in most of the world (Crown patent applies within the UK).',
  },
  {
    id: 'ebible-asv',
    title: 'American Standard Version (1901)',
    url: 'https://ebible.org/find/show.php?id=eng-asv',
    license: 'Public Domain',
    licenseUrl: 'https://ebible.org/',
    attribution: 'American Standard Version (1901), public domain.',
  },
  {
    id: 'berean-bsb',
    title: 'Berean Standard Bible (BSB)',
    url: 'https://berean.bible',
    license: 'Public Domain',
    licenseUrl: 'https://berean.bible/licensing.htm',
    attribution: 'The Holy Bible, Berean Standard Bible, BSB. Produced in cooperation with Bible Hub, Discovery Bible, unfoldingWord, Bible Aquifer, OpenBible.com, and the Berean Bible Translation Committee. Dedicated to the public domain.',
  },
  {
    id: 'berean-interlinear',
    title: 'Berean Standard Bible Interlinear Tables',
    url: 'https://berean.bible/downloads.htm',
    license: 'Public Domain',
    licenseUrl: 'https://berean.bible/licensing.htm',
    attribution: 'Berean Standard Bible interlinear tables, dedicated to the public domain.',
  },
  {
    id: 'stepbible-tahot',
    title: 'STEPBible TAHOT — Translators Amalgamated Hebrew OT',
    url: 'https://github.com/STEPBible/STEPBible-Data',
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    attribution: 'TAHOT data created by www.STEPBible.org based on work at Tyndale House Cambridge (CC BY 4.0). Source: github.com/STEPBible/STEPBible-Data.',
  },
  {
    id: 'stepbible-tagnt',
    title: 'STEPBible TAGNT — Translators Amalgamated Greek NT',
    url: 'https://github.com/STEPBible/STEPBible-Data',
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    attribution: 'TAGNT data created by www.STEPBible.org based on work at Tyndale House Cambridge (CC BY 4.0). Source: github.com/STEPBible/STEPBible-Data.',
  },
  {
    id: 'stepbible-tbesh',
    title: 'STEPBible TBESH — Brief Hebrew Lexicon (abridged BDB)',
    url: 'https://github.com/STEPBible/STEPBible-Data',
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    attribution: 'TBESH data created by www.STEPBible.org based on work at Tyndale House Cambridge (CC BY 4.0).',
  },
  {
    id: 'stepbible-tbesg',
    title: 'STEPBible TBESG — Brief Greek Lexicon (extended Abbott-Smith)',
    url: 'https://github.com/STEPBible/STEPBible-Data',
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    attribution: 'TBESG data created by www.STEPBible.org based on work at Tyndale House Cambridge (CC BY 4.0).',
  },
  {
    id: 'dodson',
    title: 'Dodson Greek-English Lexicon',
    url: 'https://github.com/biblicalhumanities/Dodson-Greek-Lexicon',
    license: 'CC0 / Public Domain',
    licenseUrl: 'https://github.com/biblicalhumanities/Dodson-Greek-Lexicon/blob/master/LICENSE',
    attribution: 'Public Domain Greek-English lexicon of the New Testament by John Jeffrey Dodson (CC0).',
  },
  {
    id: 'openbible-xrefs',
    title: 'OpenBible.info Cross References',
    url: 'https://www.openbible.info/labs/cross-references/',
    license: 'CC BY',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    attribution: 'Cross-reference data from OpenBible.info (CC BY).',
  },
];

function writeMeta(db: Database.Database, artifact: string): void {
  const ins = db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?,?)');
  ins.run('schema_version', SCHEMA_VERSION);
  ins.run('artifact', artifact);
  ins.run('build_date', new Date().toISOString());
  const insSource = db.prepare(
    'INSERT OR REPLACE INTO sources (source_id, title, url, version, retrieved_at, license, license_url, attribution) VALUES (?,?,?,?,?,?,?,?)',
  );
  for (const s of SOURCES) {
    insSource.run(s.id, s.title, s.url, null, new Date().toISOString().slice(0, 10), s.license, s.licenseUrl, s.attribution);
  }
}

function finalize(db: Database.Database, tmpPath: string, finalPath: string): void {
  db.exec('PRAGMA optimize');
  db.exec('PRAGMA journal_mode = DELETE'); // ship a single file, no WAL sidecars
  db.exec('VACUUM');
  db.close();
  fs.renameSync(tmpPath, finalPath);
  const mb = (fs.statSync(finalPath).size / 1024 / 1024).toFixed(1);
  log(`wrote ${finalPath} (${mb} MB)`);
}

function main(): void {
  const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : undefined;
  fs.mkdirSync(DIST, { recursive: true });
  const schema = (f: string) => path.join(ROOT, 'pipeline', 'schema', f);

  const corePath = path.join(DIST, 'bible-core.db');
  const coreTmp = corePath + '.tmp';
  const studyPath = path.join(DIST, 'bible-study.db');
  const studyTmp = studyPath + '.tmp';

  // Core must exist (fresh or prior) because study stages consult/extend the spine.
  let core: Database.Database;
  if (only === 'study' && fs.existsSync(corePath)) {
    core = new Database(corePath);
  } else {
    if (fs.existsSync(coreTmp)) fs.rmSync(coreTmp);
    core = new Database(coreTmp);
    core.exec(fs.readFileSync(schema('core.sql'), 'utf8'));
    writeMeta(core, 'core');
    stageTranslations(core);
    stageCrossRefs(core);
  }

  if (only !== 'core') {
    if (fs.existsSync(studyTmp)) fs.rmSync(studyTmp);
    const study = new Database(studyTmp);
    study.exec(fs.readFileSync(schema('study.sql'), 'utf8'));
    writeMeta(study, 'study');
    stageHebrewWords(study, core);
    stageGreekWords(study, core);
    stageBsbInterlinear(study);
    stageLexicons(study);
    verifyStudy(study, core);
    finalize(study, studyTmp, studyPath);
  }

  if (only !== 'study' || !fs.existsSync(corePath)) {
    // FTS after words stages so any title-only verses added to the spine are final.
    stageFts(core);
    verifyCore(core);
    finalize(core, coreTmp, corePath);
  } else {
    core.close();
  }

  log('build complete');
}

main();
