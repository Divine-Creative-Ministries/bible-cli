import type { Database } from 'better-sqlite3';
import { log } from '../lib.js';

class VerifyError extends Error {}

function check(cond: boolean, msg: string): void {
  if (!cond) throw new VerifyError(`VERIFY FAILED: ${msg}`);
  log(`  ok: ${msg}`);
}

export function verifyCore(db: Database): void {
  log('verifying core...');
  const one = <T = Record<string, unknown>>(sql: string, ...args: unknown[]): T =>
    db.prepare(sql).get(...(args as [])) as T;

  const nBooks = one<{ n: number }>('SELECT COUNT(*) n FROM books').n;
  check(nBooks === 66, `66 books (got ${nBooks})`);

  // KJV verse count: 31,102 numbered verses (titles are verse 0 rows on top)
  const kjv = one<{ n: number }>(
    "SELECT COUNT(*) n FROM verse_texts WHERE translation_id='KJV' AND verse_id % 1000 != 0",
  ).n;
  check(Math.abs(kjv - 31102) <= 5, `KJV ~31,102 verses (got ${kjv})`);

  for (const t of ['WEB', 'ASV', 'BSB']) {
    const n = one<{ n: number }>(
      'SELECT COUNT(*) n FROM verse_texts WHERE translation_id=? AND verse_id % 1000 != 0',
      t,
    ).n;
    check(n > 30800 && n < 31200, `${t} verse count in range (got ${n})`);
  }

  const jn316 = one<{ text: string }>(
    "SELECT text FROM verse_texts WHERE translation_id='KJV' AND verse_id=43003016",
  );
  check(/only begotten Son/.test(jn316?.text ?? ''), 'KJV John 3:16 text sane');

  const gen11 = one<{ text: string }>(
    "SELECT text FROM verse_texts WHERE translation_id='BSB' AND verse_id=1001001",
  );
  check(/In the beginning God created/.test(gen11?.text ?? ''), 'BSB Gen 1:1 text sane');

  // No USFM markers or footnote debris leaked into any text
  const leak = one<{ n: number }>("SELECT COUNT(*) n FROM verse_texts WHERE text LIKE '%\\%'").n;
  check(leak === 0, `no backslash markers leaked (got ${leak})`);
  const stars = one<{ n: number }>("SELECT COUNT(*) n FROM verse_texts WHERE text LIKE '%*%' OR text LIKE '%|%'").n;
  check(stars === 0, `no marker residue (* or |) leaked (got ${stars})`);

  const xrefs = one<{ n: number }>('SELECT COUNT(*) n FROM cross_refs').n;
  check(xrefs > 300000, `cross-references > 300k (got ${xrefs})`);

  const fts = one<{ n: number }>(
    "SELECT COUNT(*) n FROM verse_fts WHERE verse_fts MATCH 'beginning' AND translation_id='KJV'",
  ).n;
  check(fts > 100, `FTS 'beginning' hits in KJV (got ${fts})`);

  // Psalm titles present as verse 0
  const titles = one<{ n: number }>(
    "SELECT COUNT(*) n FROM verse_texts WHERE translation_id='KJV' AND verse_id BETWEEN 19000000 AND 19999999 AND verse_id % 1000 = 0",
  ).n;
  check(titles > 90, `KJV Psalm titles ingested (got ${titles})`);
}

export function verifyStudy(db: Database, core: Database): void {
  log('verifying study...');
  const one = <T = Record<string, unknown>>(sql: string, ...args: unknown[]): T =>
    db.prepare(sql).get(...(args as [])) as T;

  const heb = one<{ n: number }>("SELECT COUNT(*) n FROM words WHERE lang IN ('H','A')").n;
  check(heb > 400000, `Hebrew/Aramaic morpheme rows > 400k (got ${heb})`);

  const grk = one<{ n: number }>("SELECT COUNT(*) n FROM words WHERE lang='G'").n;
  check(grk > 130000, `Greek word rows > 130k (got ${grk})`);

  const aram = one<{ n: number }>(
    "SELECT COUNT(*) n FROM words WHERE lang='A' AND verse_id BETWEEN 27000000 AND 27999999",
  ).n;
  check(aram > 4000, `Aramaic rows in Daniel (got ${aram})`);

  // Gen 1:1 first word = בְּרֵאשִׁית with H7225
  const gen11 = db
    .prepare('SELECT strongs_num, pos FROM words WHERE verse_id=1001001 AND word_num=1 ORDER BY part_num')
    .all() as Array<{ strongs_num: number; pos: string }>;
  check(gen11.some((w) => w.strongs_num === 7225), 'Gen 1:1 word 1 tagged H7225 (reshit)');

  // John 3:16 has G0025/G0026 agapao family
  const jn316 = db
    .prepare('SELECT strongs_num FROM words WHERE verse_id=43003016')
    .all() as Array<{ strongs_num: number }>;
  check(jn316.some((w) => w.strongs_num === 25), 'John 3:16 contains G0025 (agapao)');

  // Psalm 51 versification: title words at 19051000, Hebrew 51:3 maps to spine 51:1
  const ps51 = one<{ n: number }>('SELECT COUNT(*) n FROM words WHERE verse_id=19051000').n;
  check(ps51 > 0, 'Psalm 51 title words at verse 0');
  const vmap = core
    .prepare("SELECT spine_verse_id FROM versification_map WHERE tradition='Hebrew' AND book_num=19 AND chapter=51 AND verse=3")
    .get() as { spine_verse_id: number } | undefined;
  check(vmap?.spine_verse_id === 19051001, `Heb Ps 51:3 -> spine 51:1 (got ${vmap?.spine_verse_id})`);

  // Malachi 4 (Heb 3:19-24) exists on spine with words
  const mal4 = one<{ n: number }>('SELECT COUNT(*) n FROM words WHERE verse_id BETWEEN 39004001 AND 39004999').n;
  check(mal4 > 50, `Malachi 4 words present (got ${mal4})`);

  // Every word verse exists in the core spine
  const orphanQ = core.prepare('SELECT 1 FROM verses WHERE verse_id = ?');
  const distinctVerses = db.prepare('SELECT DISTINCT verse_id v FROM words').all() as Array<{ v: number }>;
  const orphans = distinctVerses.filter((r) => !orphanQ.get(r.v));
  check(orphans.length === 0, `no orphan word verses (got ${orphans.length}${orphans.length ? ' e.g. ' + orphans[0]!.v : ''})`);

  // Word reconstruction: Gen 1:1 word 1 morphemes concatenate to בראשית
  const gen11w1 = (db
    .prepare('SELECT surface_norm FROM words WHERE verse_id=1001001 AND word_num=1 ORDER BY part_num')
    .all() as Array<{ surface_norm: string }>)
    .map((r) => r.surface_norm)
    .join('');
  check(gen11w1 === 'בראשית', `Gen 1:1 word 1 reconstructs to בראשית (got '${gen11w1}')`);

  // Edition fidelity: TR John 1:18 reads υἱός (G5207) where NA reads θεός
  const tr118 = one<{ n: number }>(
    'SELECT COUNT(*) n FROM words WHERE verse_id=43001018 AND strongs_num=5207 AND (editions & 8) != 0',
  ).n;
  check(tr118 > 0, 'TR John 1:18 has υἱός variant row');

  // LXX-reconstructed X additions stay out of the default stream
  const xDefault = one<{ n: number }>("SELECT COUNT(*) n FROM words WHERE text_type LIKE 'X%' AND is_default=1").n;
  check(xDefault === 0, `no X-stream rows in default stream (got ${xDefault})`);
  const deu3016 = one<{ n: number }>("SELECT COUNT(*) n FROM words WHERE verse_id=5030016 AND text_type LIKE 'X%'").n;
  check(deu3016 > 0, 'Deut 30:16 LXX addition present as variant rows');

  // No empty default surfaces
  const emptyDefault = one<{ n: number }>("SELECT COUNT(*) n FROM words WHERE is_default=1 AND surface=''").n;
  check(emptyDefault === 0, `no empty default surfaces (got ${emptyDefault})`);

  // Greek versification: Greek Rev 12:18 lives at spine Rev 13:1, before its own words
  const rev = core
    .prepare("SELECT spine_verse_id FROM versification_map WHERE tradition='Greek' AND book_num=66 AND chapter=12 AND verse=18")
    .get() as { spine_verse_id: number } | undefined;
  check(rev?.spine_verse_id === 66013001, `Greek Rev 12:18 -> spine Rev 13:1 (got ${rev?.spine_verse_id})`);
  const revOrder = one<{ n: number }>('SELECT COUNT(*) n FROM words WHERE verse_id=66013001 AND word_num < 1').n;
  check(revOrder > 0, 'Rev 12:18 words sort before Rev 13:1 words');

  // Default Greek stream: exactly one default row per (verse, word_num) slot
  const dupDefault = one<{ n: number }>(
    `SELECT COUNT(*) n FROM (
       SELECT verse_id, word_num FROM words WHERE lang='G' AND is_default=1
       GROUP BY verse_id, word_num, part_num HAVING COUNT(*) > 1)`,
  ).n;
  check(dupDefault === 0, `no duplicate default Greek slots (got ${dupDefault})`);

  // Lexicon coverage: every tagged Strong's resolves (exactly or by number)
  const knownStrongs = new Set(
    (db.prepare('SELECT DISTINCT strongs FROM lexicon_entries').all() as Array<{ strongs: string }>).map((r) => r.strongs),
  );
  const knownNums = new Set(
    (db.prepare('SELECT DISTINCT substr(strongs,1,1) l, strongs_num FROM lexicon_entries').all() as Array<{ l: string; strongs_num: number }>).map(
      (r) => `${r.l}:${r.strongs_num}`,
    ),
  );
  const usedStrongs = db
    .prepare('SELECT DISTINCT strongs, strongs_num FROM words WHERE strongs IS NOT NULL')
    .all() as Array<{ strongs: string; strongs_num: number }>;
  const unresolved = usedStrongs.filter((u) => !knownStrongs.has(u.strongs) && !knownNums.has(`${u.strongs[0]}:${u.strongs_num}`));
  check(unresolved.length === 0, `every tagged Strong's resolves in a lexicon (unresolved: ${unresolved.length}${unresolved.length ? ' e.g. ' + unresolved[0]!.strongs : ''})`);

  const bdbN = one<{ n: number }>("SELECT COUNT(*) n FROM lexicon_entries WHERE lexicon_id='bdb'").n;
  check(bdbN > 7000, `BDB entries > 7000 (got ${bdbN})`);

  const lex = one<{ n: number }>('SELECT COUNT(*) n FROM lexicon_entries').n;
  check(lex > 15000, `lexicon entries > 15k (got ${lex})`);
}
