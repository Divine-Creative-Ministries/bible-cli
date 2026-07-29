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

  // Default Greek stream: exactly one default row per (verse, word_num) slot
  const dupDefault = one<{ n: number }>(
    `SELECT COUNT(*) n FROM (
       SELECT verse_id, word_num FROM words WHERE lang='G' AND is_default=1
       GROUP BY verse_id, word_num, part_num HAVING COUNT(*) > 1)`,
  ).n;
  check(dupDefault === 0, `no duplicate default Greek slots (got ${dupDefault})`);

  // Lexicon coverage: words' strongs resolve
  const unresolved = one<{ n: number }>(
    `SELECT COUNT(DISTINCT w.strongs) n FROM words w
     WHERE w.strongs IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM lexicon_entries le WHERE le.strongs = w.strongs)
       AND NOT EXISTS (SELECT 1 FROM lexicon_entries le2 WHERE le2.strongs_num =
         w.strongs_num AND le2.lexicon_id IN ('tbesh','tbesg'))`,
  ).n;
  check(unresolved < 50, `almost all Strong's resolve in lexicons (unresolved distinct: ${unresolved})`);

  const il = one<{ n: number }>('SELECT COUNT(*) n FROM bsb_interlinear').n;
  check(il > 400000, `BSB interlinear rows > 400k (got ${il})`);

  const lex = one<{ n: number }>('SELECT COUNT(*) n FROM lexicon_entries').n;
  check(lex > 15000, `lexicon entries > 15k (got ${lex})`);
}
