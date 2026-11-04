/**
 * Mobile data packs for the Bible CLI app (iOS/Android, expo-sqlite).
 *
 *   bible-mobile-<TR>.db   one per public-domain translation (BSB, KJV, WEB, ASV):
 *                          verse text (rowid = verse id) + external-content FTS5
 *                          index; BSB also carries section headings + paragraphs.
 *   bible-mobile-xref.db   OpenBible.info cross-references (CC BY).
 *   bible-mobile-originals.db  Hebrew/Aramaic/Greek words (default reading stream
 *                          plus alternate-edition words the BSB aligns to),
 *                          lexicon slice (BDB / ext. Abbott-Smith / Dodson),
 *                          BSB alignment spans, supplied words, renderings.
 *
 * LXX (CC BY-SA) is deliberately excluded from every pack. Agents reach it
 * through the hosted MCP tools instead.
 *
 * Every pack has the same `meta` + `sources` tables as the desktop artifacts
 * so the app's About screen can render attribution from the data itself.
 */
import Database from 'better-sqlite3';
import * as fs from 'node:fs';
import * as path from 'node:path';

export const MOBILE_SCHEMA_VERSION = '1';
export const MOBILE_TRANSLATIONS = ['BSB', 'KJV', 'WEB', 'ASV'] as const;

const META_SQL = `
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE sources (
  source_id TEXT PRIMARY KEY, title TEXT NOT NULL, url TEXT NOT NULL, version TEXT,
  retrieved_at TEXT NOT NULL, license TEXT NOT NULL, license_url TEXT, attribution TEXT NOT NULL
);`;

function fresh(file: string): Database.Database {
  fs.rmSync(file, { force: true });
  const db = new Database(file);
  db.pragma('journal_mode = OFF');
  db.pragma('synchronous = OFF');
  db.pragma('page_size = 4096');
  db.exec(META_SQL);
  return db;
}

function finish(db: Database.Database, meta: Record<string, string>): void {
  const ins = db.prepare(`INSERT OR REPLACE INTO meta VALUES (?,?)`);
  for (const [k, v] of Object.entries({ schema_version: MOBILE_SCHEMA_VERSION, build_date: new Date().toISOString(), ...meta })) ins.run(k, v);
  db.exec('ANALYZE; VACUUM;');
  db.close();
}

export interface MobileInputs {
  core: string;
  study: string;
  align: string;
  outDir: string;
}

export function buildTranslationPack(inp: MobileInputs, tr: (typeof MOBILE_TRANSLATIONS)[number]): string {
  const file = path.join(inp.outDir, `bible-mobile-${tr}.db`);
  const db = fresh(file);
  db.exec(`
    CREATE TABLE books (book_num INTEGER PRIMARY KEY, usfm_code TEXT NOT NULL, name TEXT NOT NULL,
                        testament TEXT NOT NULL, n_chapters INTEGER NOT NULL);
    CREATE TABLE verses (verse_id INTEGER PRIMARY KEY, text TEXT NOT NULL, bridge_end INTEGER);
    CREATE TABLE headings (verse_id INTEGER NOT NULL, seq INTEGER NOT NULL, text TEXT NOT NULL,
                           PRIMARY KEY (verse_id, seq)) WITHOUT ROWID;
    CREATE TABLE paragraphs (verse_id INTEGER NOT NULL, eng_offset INTEGER NOT NULL, style TEXT NOT NULL,
                             PRIMARY KEY (verse_id, eng_offset)) WITHOUT ROWID;
  `);
  db.exec(`ATTACH '${inp.core.replace(/'/g, "''")}' AS core`);
  const sourceId = (db.prepare(`SELECT source_id FROM core.translations WHERE translation_id = ?`).get(tr) as { source_id: string }).source_id;
  db.exec(`
    INSERT INTO books SELECT book_num, usfm_code, name, testament, n_chapters FROM core.books;
    INSERT INTO verses SELECT verse_id, text, bridge_end FROM core.verse_texts WHERE translation_id = '${tr}' ORDER BY verse_id;
  `);
  if (tr === 'BSB') {
    db.exec(`ATTACH '${inp.align.replace(/'/g, "''")}' AS al`);
    db.exec(`INSERT INTO headings SELECT verse_id, seq, text FROM al.bsb_headings;
             INSERT INTO paragraphs SELECT verse_id, eng_offset, style FROM al.bsb_paragraphs;`);
    db.exec('DETACH al');
  }
  // External-content FTS5: the index references verses.text, no duplicate copy.
  db.exec(`
    CREATE VIRTUAL TABLE verse_fts USING fts5(
      text, content='verses', content_rowid='verse_id',
      -- apostrophes (ASCII ' and the texts' curly ’) are separators, so "God's"
      -- typed on a keyboard matches "God’s" in the text (both → god + s)
      tokenize = "unicode61 remove_diacritics 2 tokenchars '-'"
    );
    INSERT INTO verse_fts(verse_fts) VALUES ('rebuild');
    INSERT INTO verse_fts(verse_fts) VALUES ('optimize');
  `);
  db.prepare(`INSERT INTO sources SELECT * FROM core.sources WHERE source_id = ?`).run(sourceId);
  db.exec('DETACH core');
  finish(db, { artifact: `mobile-${tr}`, translation: tr });
  return file;
}

export function buildXrefPack(inp: MobileInputs): string {
  const file = path.join(inp.outDir, `bible-mobile-xref.db`);
  const db = fresh(file);
  db.exec(`
    CREATE TABLE cross_refs (from_verse_id INTEGER NOT NULL, to_verse_start INTEGER NOT NULL,
      to_verse_end INTEGER NOT NULL, votes INTEGER NOT NULL,
      PRIMARY KEY (from_verse_id, to_verse_start, to_verse_end)) WITHOUT ROWID;
  `);
  db.exec(`ATTACH '${inp.core.replace(/'/g, "''")}' AS core`);
  db.exec(`INSERT INTO cross_refs SELECT * FROM core.cross_refs WHERE votes > 0;
           INSERT INTO sources SELECT * FROM core.sources WHERE source_id LIKE 'openbible%';`);
  db.exec('DETACH core');
  finish(db, { artifact: 'mobile-xref' });
  return file;
}

export function buildOriginalsPack(inp: MobileInputs): string {
  const file = path.join(inp.outDir, `bible-mobile-originals.db`);
  const db = fresh(file);
  db.exec(`
    -- decoded morphology, normalised: 1.7k distinct codes instead of 12 columns × 607k rows
    CREATE TABLE morphs (
      morph_id INTEGER PRIMARY KEY, code TEXT NOT NULL, lang TEXT NOT NULL,
      pos TEXT, person TEXT, gender TEXT, number_ TEXT, gcase TEXT, tense TEXT, voice TEXT,
      mood TEXT, stem TEXT, state TEXT, degree TEXT,
      UNIQUE (code, lang)
    );
    CREATE TABLE words (
      verse_id INTEGER NOT NULL, word_num INTEGER NOT NULL, part_num INTEGER NOT NULL,
      lang TEXT NOT NULL, surface TEXT NOT NULL, translit TEXT, lemma TEXT,
      strongs TEXT,                 -- extended form, joins lexicon.strongs ('H0430G', 'G3306')
      gloss TEXT, morph_id INTEGER, is_default INTEGER NOT NULL,
      PRIMARY KEY (verse_id, word_num, part_num)
    ) WITHOUT ROWID;
    CREATE TABLE lexicon (
      lexicon_id TEXT NOT NULL, strongs TEXT NOT NULL, strongs_num INTEGER NOT NULL,
      lemma TEXT, translit TEXT, pos TEXT, short_gloss TEXT, definition TEXT,
      PRIMARY KEY (lexicon_id, strongs)
    ) WITHOUT ROWID;
    CREATE TABLE lexicons (lexicon_id TEXT PRIMARY KEY, title TEXT NOT NULL, lang TEXT NOT NULL, source_id TEXT NOT NULL);
    -- BSB alignment: one row per original word of a BSB verse (in original order)
    CREATE TABLE bsb_words (
      verse_id INTEGER NOT NULL, src_idx INTEGER NOT NULL,
      strongs TEXT,                 -- 'H7225' / 'G3306' (numeric, as in the BSB tables)
      word_num INTEGER,             -- words.word_num, NULL = not linked
      word_verse_id INTEGER,        -- words.verse_id when it differs (Psalm titles: verse 0)
      eng_start INTEGER, eng_end INTEGER,   -- UTF-16 offsets into the BSB verse text
      kind INTEGER NOT NULL,        -- 0 span · 1 untranslated · 2 rendered with a neighbour · 3 unlocated
      PRIMARY KEY (verse_id, src_idx)
    ) WITHOUT ROWID;
    CREATE TABLE bsb_supplied (
      verse_id INTEGER NOT NULL, eng_start INTEGER NOT NULL, eng_end INTEGER NOT NULL, src_idx INTEGER,
      PRIMARY KEY (verse_id, eng_start)
    ) WITHOUT ROWID;
    CREATE TABLE bsb_renderings (
      strongs TEXT NOT NULL, rendering TEXT NOT NULL, count INTEGER NOT NULL,
      PRIMARY KEY (strongs, rendering)
    ) WITHOUT ROWID;
  `);
  db.exec(`ATTACH '${inp.study.replace(/'/g, "''")}' AS st`);
  db.exec(`ATTACH '${inp.align.replace(/'/g, "''")}' AS al`);
  db.exec(`
    CREATE TEMP TABLE keep AS
      SELECT verse_id, word_num, part_num FROM st.words WHERE is_default = 1
      UNION
      -- alternate-edition word slots the BSB aligns to
      SELECT w.verse_id, w.word_num, w.part_num FROM st.words w
        JOIN al.bsb_words b ON b.word_verse_id = w.verse_id AND b.word_num = w.word_num
       WHERE b.match = 'edition';
    INSERT INTO morphs (code, lang, pos, person, gender, number_, gcase, tense, voice, mood, stem, state, degree)
      SELECT DISTINCT morph_raw, CASE lang WHEN 'G' THEN 'G' ELSE 'H' END,
             pos, person, gender, number_, gcase, tense, voice, mood, stem, state, degree
        FROM st.words w WHERE morph_raw IS NOT NULL
         AND EXISTS (SELECT 1 FROM keep k WHERE k.verse_id = w.verse_id AND k.word_num = w.word_num AND k.part_num = w.part_num)
       GROUP BY morph_raw, CASE lang WHEN 'G' THEN 'G' ELSE 'H' END;
    -- default and alternate-edition rows can share a slot: keep the default reading
    INSERT OR IGNORE INTO words
      SELECT w.verse_id, w.word_num, w.part_num, w.lang, w.surface, w.translit, w.lemma, w.strongs, w.gloss,
             (SELECT morph_id FROM morphs m WHERE m.code = w.morph_raw AND m.lang = CASE w.lang WHEN 'G' THEN 'G' ELSE 'H' END),
             w.is_default
        FROM st.words w JOIN keep k USING (verse_id, word_num, part_num)
       ORDER BY w.verse_id, w.word_num, w.part_num, w.is_default DESC;
    CREATE INDEX idx_words_strongs ON words(strongs);

    INSERT INTO lexicons SELECT * FROM st.lexicons WHERE lexicon_id IN ('bdb','tbesg','dodson','affixes','tagged');
    INSERT INTO lexicon SELECT lexicon_id, strongs, strongs_num, lemma, translit, pos, short_gloss, definition
      FROM st.lexicon_entries WHERE lexicon_id IN ('bdb','tbesg','dodson','affixes','tagged');
    CREATE INDEX idx_lex_num ON lexicon(strongs_num);

    INSERT INTO bsb_words
      SELECT verse_id, src_idx, strongs, word_num,
             CASE WHEN word_verse_id = verse_id THEN NULL ELSE word_verse_id END,
             eng_start, eng_end,
             CASE kind WHEN 'span' THEN 0 WHEN 'untranslated' THEN 1 WHEN 'merged' THEN 2 ELSE 3 END
        FROM al.bsb_words ORDER BY verse_id, src_idx;
    INSERT INTO bsb_supplied SELECT * FROM al.bsb_supplied;
    INSERT INTO bsb_renderings SELECT * FROM al.bsb_renderings;
    INSERT INTO sources SELECT * FROM st.sources;
  `);
  db.exec(`INSERT OR IGNORE INTO sources VALUES ('berean-bsb-tables', 'Berean Standard Bible translation tables',
    'https://bereanbible.com/bsb_tables.tsv', NULL, '${new Date().toISOString().slice(0, 10)}', 'Public Domain',
    'https://berean.bible/terms.htm',
    'BSB translation tables, Berean Bible. The Berean Bible and Majority Bible texts are dedicated to the public domain (2023-04-30). Used for English-word alignment only.')`);
  // drop any LXX source row: the pack must not claim (or contain) CC BY-SA data
  db.exec(`DELETE FROM sources WHERE source_id LIKE '%lxx%' OR license LIKE '%BY-SA%'`);
  db.exec('DETACH st; DETACH al;');
  finish(db, { artifact: 'mobile-originals' });
  return file;
}
