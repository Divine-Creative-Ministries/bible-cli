import type { Database } from 'better-sqlite3';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { RAW, log } from '../lib.js';

/**
 * STEPBible TIPNR — Translators Individualised Proper Names (CC BY).
 * Records are blocks separated by '$==========PERSON(s)/PLACE/OTHER' lines:
 *   top line:  UniqueName@FirstRef[-LastBook]=uStrong <TAB> description <TAB> ...
 *   sub-lines: '– Named|Greek|Spelled...' with dStrong«eStrong=form
 *   '@Brief= ...' and '@Short= ...' description lines.
 * The '@Article=' fields are AI-generated per the file header and are skipped.
 */
export function stageNames(db: Database): void {
  const file = path.join(RAW, 'stepbible', 'TIPNR.txt');
  const lines = fs.readFileSync(file, 'utf8').split('\n');

  const insName = db.prepare(
    'INSERT INTO names (name_id, kind, unique_name, display_name, ustrong, description, summary, meta) VALUES (?,?,?,?,?,?,?,?)',
  );
  const insStrong = db.prepare('INSERT OR IGNORE INTO name_strongs (name_id, strongs) VALUES (?,?)');

  let kind: string | null = null;
  let nameId = 0;
  let current: {
    uniqueName: string;
    display: string;
    ustrong: string | null;
    meta: string | null;
    brief: string | null;
    short: string | null;
    strongs: Set<string>;
  } | null = null;
  let counts = { person: 0, place: 0, other: 0 };

  const cell = (line: string, i: number): string => (line.split('\t')[i] ?? '').trim();

  const flush = (): void => {
    if (!current || current.strongs.size === 0) {
      current = null;
      return;
    }
    nameId++;
    insName.run(
      nameId,
      kind ?? 'other',
      current.uniqueName,
      current.display,
      current.ustrong,
      current.brief,
      current.short,
      current.meta,
    );
    for (const s of current.strongs) insStrong.run(nameId, s);
    counts[(kind ?? 'other') as keyof typeof counts]++;
    current = null;
  };

  db.transaction(() => {
    for (const raw of lines) {
      const line = raw.replace(/\r$/, '');
      const sep = line.match(/^\$=+\s*([A-Za-z+()\s]+?)\s*$/);
      if (sep && /PERSON|PLACE|OTHER/i.test(sep[1]!)) {
        flush();
        const label = sep[1]!.toUpperCase();
        // 'PERSON+PLACE' records (e.g. Shechem) are places named for people
        kind = label.includes('PLACE') ? 'place' : label.includes('PERSON') ? 'person' : 'other';
        continue;
      }
      if (!kind) continue;

      const first = cell(line, 0);
      // top line of a record: Name@Book.C.V...=Strongs
      const top = first.match(/^([^@\t]+)@([1-3]?[A-Za-z]+\.\d+\.\d+[^=]*)=([HG]\d{4}[A-Za-z]?)?/);
      if (top && !line.startsWith('–') && !line.startsWith('@')) {
        flush();
        current = {
          uniqueName: `${top[1]}@${top[2]}`.trim(),
          display: top[1]!.split('|').pop()!.trim(),
          ustrong: top[3] ?? null,
          meta: cell(line, 1) || null,
          brief: null,
          short: null,
          strongs: new Set(),
        };
        if (top[3]) current.strongs.add(top[3]);
        continue;
      }
      if (!current) continue;

      if (line.startsWith('– ') || line.startsWith('–\t')) {
        // significance sub-line; dStrong in the third column before '«'
        const d = cell(line, 2).match(/^([HG]\d{4}[A-Za-z]?)«/);
        if (d) current.strongs.add(d[1]!);
        continue;
      }
      if (first.startsWith('@Brief=')) {
        current.brief = first.slice('@Brief='.length).trim() || null;
        continue;
      }
      if (first.startsWith('@Short=')) {
        current.short = first.slice('@Short='.length).trim() || null;
        continue;
      }
    }
    flush();
  })();

  log(`names: ${counts.person} persons, ${counts.place} places, ${counts.other} other`);
  if (counts.person < 2500) throw new Error(`TIPNR parse suspiciously small: ${counts.person} persons`);
}
