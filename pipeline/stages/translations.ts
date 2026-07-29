import type { Database } from 'better-sqlite3';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { BOOKS, lookupBook, makeVerseId } from '../../src/canon.js';
import { RAW, log } from '../lib.js';
import { parseUsfm } from '../parsers/usfm.js';

interface VerseRow {
  translation: string;
  verseId: number;
  text: string;
  bridgeEnd: number | null;
}

const USFM_EDITIONS = [
  { id: 'WEB', dir: 'eng-web_usfm', name: 'World English Bible', source: 'ebible-web' },
  { id: 'KJV', dir: 'eng-kjv2006_usfm', name: 'King James Version', source: 'ebible-kjv' },
  { id: 'ASV', dir: 'eng-asv_usfm', name: 'American Standard Version (1901)', source: 'ebible-asv' },
];

export function stageTranslations(db: Database): void {
  const rows: VerseRow[] = [];

  for (const ed of USFM_EDITIONS) {
    const dir = path.join(RAW, 'ebible', ed.dir);
    let count = 0;
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.usfm'))) {
      const { bookId, verses } = parseUsfm(fs.readFileSync(path.join(dir, file), 'utf8'));
      const book = lookupBook(bookId);
      if (!book) continue; // front matter, apocrypha
      for (const v of verses) {
        if (v.chapter < 1 && v.verse !== 0) continue;
        rows.push({
          translation: ed.id,
          verseId: makeVerseId(book.bookNum, v.chapter, v.verse),
          text: v.text,
          bridgeEnd: v.endVerse ? makeVerseId(book.bookNum, v.chapter, v.endVerse) : null,
        });
        count++;
      }
    }
    log(`${ed.id}: ${count} verses`);
  }

  // BSB from bsb.txt: "Genesis 1:1\ttext"
  {
    const content = fs.readFileSync(path.join(RAW, 'berean', 'bsb.txt'), 'utf8');
    let count = 0;
    for (const line of content.split('\n')) {
      const tab = line.indexOf('\t');
      if (tab < 0) continue;
      const ref = line.slice(0, tab).trim();
      const text = line.slice(tab + 1).replace(/\r$/, '').trim();
      const m = ref.match(/^(.+?) (\d+):(\d+)$/);
      if (!m || !text) continue;
      const book = lookupBook(m[1]!);
      if (!book) continue;
      rows.push({
        translation: 'BSB',
        verseId: makeVerseId(book.bookNum, parseInt(m[2]!, 10), parseInt(m[3]!, 10)),
        text,
        bridgeEnd: null,
      });
      count++;
    }
    log(`BSB: ${count} verses`);
  }

  // Spine = union of verses across translations (+ verse 0 titles).
  const spine = new Set<number>(rows.map((r) => r.verseId));

  const insBook = db.prepare(
    'INSERT INTO books (book_num, usfm_code, osis_code, name, testament, n_chapters) VALUES (?,?,?,?,?,?)',
  );
  const insVerse = db.prepare('INSERT INTO verses (verse_id, book_num, chapter, verse) VALUES (?,?,?,?)');
  const insTr = db.prepare('INSERT INTO translations (translation_id, name, language, source_id) VALUES (?,?,?,?)');
  const insText = db.prepare(
    'INSERT OR REPLACE INTO verse_texts (translation_id, verse_id, text, bridge_end) VALUES (?,?,?,?)',
  );

  db.transaction(() => {
    for (const bk of BOOKS) insBook.run(bk.bookNum, bk.usfm, bk.osis, bk.name, bk.testament, bk.chapters);
    for (const id of [...spine].sort((a, z) => a - z)) {
      const bookNum = Math.floor(id / 1_000_000);
      const chapter = Math.floor((id % 1_000_000) / 1_000);
      insVerse.run(id, bookNum, chapter, id % 1_000);
    }
    for (const ed of USFM_EDITIONS) insTr.run(ed.id, ed.name, 'en', ed.source);
    insTr.run('BSB', 'Berean Standard Bible', 'en', 'berean-bsb');
    for (const r of rows) insText.run(r.translation, r.verseId, r.text, r.bridgeEnd);
  })();

  log(`spine: ${spine.size} verses`);
}

export function stageFts(db: Database): void {
  db.exec(`
    INSERT INTO verse_fts (text, translation_id, verse_id)
      SELECT text, translation_id, verse_id FROM verse_texts;
    INSERT INTO verse_fts_stem (text, translation_id, verse_id)
      SELECT text, translation_id, verse_id FROM verse_texts;
    INSERT INTO verse_fts(verse_fts) VALUES('optimize');
    INSERT INTO verse_fts_stem(verse_fts_stem) VALUES('optimize');
  `);
  log('FTS indexes built');
}
