import type { Database } from 'better-sqlite3';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { RAW, log, splitStrongs } from '../lib.js';

const htmlToText = (s: string): string =>
  s
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();

/**
 * STEPBible TBESH/TBESG brief lexicons. Tab columns:
 * [0] base strongs  [1] 'H0001G = <relation>'  [2] relation target
 * [3] lemma  [4] translit  [5] pos  [6] short gloss  [7] definition (html)
 */
function ingestTbes(db: Database, file: string, lexiconId: string): void {
  const insEntry = db.prepare(
    `INSERT OR REPLACE INTO lexicon_entries
      (lexicon_id, strongs, strongs_num, lemma, translit, pos, short_gloss, definition)
     VALUES (?,?,?,?,?,?,?,?)`,
  );
  const insLink = db.prepare('INSERT OR IGNORE INTO lexicon_links (strongs, rel, target) VALUES (?,?,?)');
  let count = 0;
  db.transaction(() => {
    const content = fs.readFileSync(path.join(RAW, 'stepbible', file), 'utf8');
    for (const line of content.split('\n')) {
      const c = line.replace(/\r$/, '').split('\t');
      if (c.length < 8 || !/^[HG]\d{4}/.test(c[0] ?? '')) continue;
      const extMatch = (c[1] ?? '').match(/^([HG]\d{4}[A-Za-z]?)\s*=\s*(.*)$/);
      const ext = extMatch ? extMatch[1]! : c[0]!;
      const st = splitStrongs(ext);
      if (!st) continue;
      insEntry.run(
        lexiconId,
        st.strongs,
        st.num,
        (c[3] ?? '').trim() || null,
        (c[4] ?? '').trim() || null,
        (c[5] ?? '').trim() || null,
        (c[6] ?? '').trim() || null,
        htmlToText(c[7] ?? '') || null,
      );
      // relation like 'a Part of', 'in Aramaic of', 'another form of' + target dStrong
      const relNote = extMatch ? extMatch[2]!.trim() : '';
      const target = (c[2] ?? '').trim().replace(/[,;].*$/, '');
      if (relNote && /^[HG]\d{4}/.test(target) && target !== ext) {
        insLink.run(st.strongs, relNote.toLowerCase().replace(/\s+/g, '-'), target);
      }
      count++;
    }
  })();
  log(`${lexiconId}: ${count} entries`);
}

/** Dodson Greek lexicon CSV (tab-separated, quoted): strongs, GK, betacode word, brief, long. */
function ingestDodson(db: Database): void {
  const insEntry = db.prepare(
    `INSERT OR REPLACE INTO lexicon_entries
      (lexicon_id, strongs, strongs_num, lemma, translit, pos, short_gloss, definition)
     VALUES (?,?,?,?,?,?,?,?)`,
  );
  const unquote = (s: string): string => s.replace(/^"|"$/g, '').replace(/""/g, '"').trim();
  let count = 0;
  db.transaction(() => {
    const content = fs.readFileSync(path.join(RAW, 'dodson', 'dodson.csv'), 'utf8');
    for (const line of content.split('\n').slice(1)) {
      const c = line.replace(/\r$/, '').split('\t').map(unquote);
      if (c.length < 5 || !/^\d+$/.test(c[0] ?? '')) continue;
      const num = parseInt(c[0]!, 10);
      insEntry.run('dodson', `G${String(num).padStart(4, '0')}`, num, null, null, null, c[3] || null, c[4] || null);
      count++;
    }
  })();
  log(`dodson: ${count} entries`);
}

export function stageLexicons(db: Database): void {
  const insLex = db.prepare('INSERT OR REPLACE INTO lexicons (lexicon_id, title, lang, source_id) VALUES (?,?,?,?)');
  insLex.run('tbesh', "Translators Brief Lexicon of Extended Strongs for Hebrew (abridged BDB)", 'H', 'stepbible-tbesh');
  insLex.run('tbesg', "Translators Brief Lexicon of Extended Strongs for Greek (ext. Abbott-Smith)", 'G', 'stepbible-tbesg');
  insLex.run('dodson', 'Dodson Greek-English Lexicon', 'G', 'dodson');
  ingestTbes(db, 'TBESH.txt', 'tbesh');
  ingestTbes(db, 'TBESG.txt', 'tbesg');
  ingestDodson(db);
  db.exec(`
    INSERT INTO lexicon_fts (short_gloss, definition, lexicon_id, strongs)
      SELECT short_gloss, definition, lexicon_id, strongs FROM lexicon_entries;
    INSERT INTO lexicon_fts(lexicon_fts) VALUES('optimize');
  `);
  log('lexicon FTS built');
}
