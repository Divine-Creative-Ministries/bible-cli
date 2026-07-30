/**
 * Rebuild only the text_parallels table inside an EXISTING bible-study.db —
 * regenerates computed inner-biblical parallels without a full pipeline run.
 * Usage: npx tsx pipeline/rebuild-parallels.ts
 */
import Database from 'better-sqlite3';
import * as path from 'node:path';
import { DIST } from './lib.js';
import { PARALLELS_DDL, stageParallels, verifyParallels } from './stages/parallels.js';

const study = new Database(path.join(DIST, 'bible-study.db'));
study.exec('DROP TABLE IF EXISTS text_parallels');
study.exec(PARALLELS_DDL);
stageParallels(study);
verifyParallels(study);
study.exec('PRAGMA optimize');
study.exec('PRAGMA journal_mode = DELETE'); // ship a single file, no WAL sidecars
study.exec('VACUUM');
study.close();
console.log('text_parallels rebuilt');
