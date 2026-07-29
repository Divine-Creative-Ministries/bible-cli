import type { Database } from 'better-sqlite3';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { lookupBook, makeVerseId } from '../../src/canon.js';
import { RAW, log } from '../lib.js';

/** OpenBible.info cross_references.txt: 'Gen.1.1\tPs.33.6\t66' with ranges 'Gen.1.1-Gen.1.3'. */
export function stageCrossRefs(db: Database): void {
  const parseOne = (ref: string): number | undefined => {
    const m = ref.match(/^([1-3]?[A-Za-z]+)\.(\d+)\.(\d+)$/);
    if (!m) return undefined;
    const book = lookupBook(m[1]!);
    if (!book) return undefined;
    return makeVerseId(book.bookNum, parseInt(m[2]!, 10), parseInt(m[3]!, 10));
  };

  const ins = db.prepare(
    'INSERT OR IGNORE INTO cross_refs (from_verse_id, to_verse_start, to_verse_end, votes) VALUES (?,?,?,?)',
  );
  let count = 0;
  let skipped = 0;
  db.transaction(() => {
    const content = fs.readFileSync(path.join(RAW, 'openbible', 'cross_references.txt'), 'utf8');
    for (const line of content.split('\n').slice(1)) {
      const c = line.replace(/\r$/, '').split('\t');
      if (c.length < 3) continue;
      const from = parseOne(c[0]!.trim());
      const toRaw = c[1]!.trim();
      const votes = parseInt(c[2]!, 10);
      if (from === undefined || Number.isNaN(votes)) {
        skipped++;
        continue;
      }
      const dash = toRaw.indexOf('-');
      const toStart = parseOne(dash < 0 ? toRaw : toRaw.slice(0, dash));
      const toEnd = dash < 0 ? toStart : parseOne(toRaw.slice(dash + 1));
      if (toStart === undefined || toEnd === undefined) {
        skipped++;
        continue;
      }
      ins.run(from, toStart, toEnd, votes);
      count++;
    }
  })();
  log(`cross-references: ${count} rows (${skipped} skipped)`);
}
