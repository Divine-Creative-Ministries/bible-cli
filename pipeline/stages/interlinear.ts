import type { Database } from 'better-sqlite3';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { lookupBook, makeVerseId } from '../../src/canon.js';
import { RAW, log } from '../lib.js';

/**
 * Ingest Berean bsb_tables.tsv: one row per original-language word, with the
 * BSB English chunk it translates. Columns (1-based):
 *  1 HebSort  2 GrkSort  3 BsbSort  4 Verse#  5 Language  6 origtext  7 origtext(+variants)
 *  8 Translit  9 Parsing  10 ParsingFull  11 StrHeb  12 StrGrk  13 VerseId("Genesis 1:1")
 *  14 Heading  ...  19 BSB gloss
 */
export function stageBsbInterlinear(study: Database): void {
  const file = path.join(RAW, 'berean', 'bsb_tables.tsv');
  const ins = study.prepare(
    `INSERT OR REPLACE INTO bsb_interlinear
      (verse_id, orig_sort, bsb_sort, lang, surface, translit, strongs, parsing, parsing_full, gloss, heading)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
  );

  let verseId = 0;
  let origSort = 0;
  let rows = 0;
  let pendingHeading: string | null = null;

  const stripHtml = (s: string): string => s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

  study.transaction(() => {
    const content = fs.readFileSync(file, 'utf8');
    for (const line of content.split('\n')) {
      const c = line.replace(/\r$/, '').split('\t');
      if (c.length < 19) continue;
      const lang = (c[4] ?? '').trim();
      if (!['Hebrew', 'Greek', 'Aramaic'].includes(lang)) continue;

      const verseRef = (c[12] ?? '').trim();
      if (verseRef) {
        const m = verseRef.match(/^(.+?) (\d+):(\d+)$/);
        if (m) {
          const book = lookupBook(m[1]!);
          if (book) {
            verseId = makeVerseId(book.bookNum, parseInt(m[2]!, 10), parseInt(m[3]!, 10));
            origSort = 0;
          }
        }
      }
      if (!verseId) continue;
      origSort++;

      const heading = stripHtml(c[13] ?? '');
      if (heading) pendingHeading = heading;

      const surface = (c[5] ?? '').trim();
      if (!surface) continue;
      const strHeb = (c[10] ?? '').trim();
      const strGrk = (c[11] ?? '').trim();
      const strongs = strHeb
        ? `H${strHeb.padStart(4, '0')}`
        : strGrk
          ? `G${strGrk.padStart(4, '0')}`
          : null;

      ins.run(
        verseId,
        origSort,
        parseInt(c[2] ?? '0', 10) || 0,
        lang,
        surface,
        (c[7] ?? '').trim() || null,
        strongs,
        (c[8] ?? '').trim() || null,
        (c[9] ?? '').trim() || null,
        (c[18] ?? '').trim(),
        pendingHeading,
      );
      pendingHeading = null;
      rows++;
    }
  })();
  log(`BSB interlinear rows: ${rows}`);
}
