/** Rebuild only the LXX artifact against existing core+study databases. */
import Database from 'better-sqlite3';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { DIST, ROOT } from './lib.js';
import { stageLxx, stageQuotations, verifyLxx } from './stages/lxx.js';

const core = new Database(path.join(DIST, 'bible-core.db'), { readonly: true });
const study = new Database(path.join(DIST, 'bible-study.db'), { readonly: true });
const tmp = path.join(DIST, 'bible-lxx.db.tmp');
fs.rmSync(tmp, { force: true });
const lxx = new Database(tmp);
lxx.exec(fs.readFileSync(path.join(ROOT, 'pipeline', 'schema', 'lxx.sql'), 'utf8'));
lxx.prepare('INSERT INTO meta (key,value) VALUES (?,?)').run('schema_version', '1');
lxx.prepare('INSERT INTO meta (key,value) VALUES (?,?)').run('artifact', 'lxx');
lxx.prepare('INSERT INTO meta (key,value) VALUES (?,?)').run('build_date', new Date().toISOString());
for (const r of study.prepare('SELECT * FROM sources').all() as Array<Record<string, string>>) {
  lxx
    .prepare('INSERT OR REPLACE INTO sources (source_id,title,url,version,retrieved_at,license,license_url,attribution) VALUES (?,?,?,?,?,?,?,?)')
    .run(r.source_id, r.title, r.url, r.version, r.retrieved_at, r.license, r.license_url, r.attribution);
}
stageLxx(lxx, core);
stageQuotations(lxx, study);
verifyLxx(lxx);
lxx.exec('PRAGMA journal_mode = DELETE');
lxx.exec('VACUUM');
lxx.close();
fs.renameSync(tmp, path.join(DIST, 'bible-lxx.db'));
console.log('lxx rebuilt');
