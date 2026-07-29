import type { Command } from 'commander';
import { BOOKS, formatVerseId } from '../canon.js';
import { dbStatus, downloadArtifact, openCore, openStudy } from '../db/index.js';
import { emit, fail, table } from '../output.js';
import { parseRef, RefError } from '../refparse/index.js';
import { EDITION_BITS } from './originals.js';

export function registerInfoCommands(program: Command): void {
  program
    .command('books')
    .description('List the 66 books with codes, chapter counts, and verse-id ranges')
    .option('--json', 'output JSON')
    .action((opts: { json?: boolean }) => {
      emit(
        opts,
        {
          books: BOOKS.map((b) => ({
            book_num: b.bookNum,
            name: b.name,
            usfm: b.usfm,
            osis: b.osis,
            testament: b.testament,
            chapters: b.chapters,
          })),
        },
        () => table([['#', 'name', 'usfm', 'osis', 'test', 'ch'], ...BOOKS.map((b) => [String(b.bookNum), b.name, b.usfm, b.osis, b.testament, String(b.chapters)])]),
      );
    });

  program
    .command('translations')
    .description('List available translations')
    .option('--json', 'output JSON')
    .action((opts: { json?: boolean }) => {
      const rows = openCore()
        .prepare('SELECT t.translation_id, t.name, s.license FROM translations t JOIN sources s ON s.source_id = t.source_id ORDER BY t.translation_id')
        .all() as Array<{ translation_id: string; name: string; license: string }>;
      emit(opts, { translations: rows }, () => table(rows.map((r) => [r.translation_id, r.name, r.license])));
    });

  program
    .command('editions')
    .description('List Greek NT editions available for --edition filters')
    .option('--json', 'output JSON')
    .action((opts: { json?: boolean }) => {
      const names: Record<string, string> = {
        na27: 'Nestle-Aland 27th ed.',
        na28: 'Nestle-Aland 28th ed. (default modern critical stream)',
        sbl: 'SBL Greek New Testament (Holmes 2010)',
        tr: 'Textus Receptus (Scrivener 1894)',
        byz: 'Byzantine Majority Text (Robinson-Pierpont)',
        wh: 'Westcott-Hort 1881',
        treg: 'Tregelles',
        tyn: 'Tyndale House Greek NT',
      };
      emit(opts, { editions: Object.keys(EDITION_BITS).map((k) => ({ id: k, name: names[k] })) }, () =>
        table(Object.keys(EDITION_BITS).map((k) => [k, names[k] ?? ''])),
      );
    });

  program
    .command('licenses')
    .description('Data sources, licenses, and required attributions')
    .option('--json', 'output JSON')
    .action((opts: { json?: boolean }) => {
      let rows = openCore()
        .prepare('SELECT source_id, title, url, license, attribution FROM sources ORDER BY source_id')
        .all() as Array<Record<string, string>>;
      try {
        const study = openStudy()
          .prepare('SELECT source_id, title, url, license, attribution FROM study.sources ORDER BY source_id')
          .all() as Array<Record<string, string>>;
        const seen = new Set(rows.map((r) => r.source_id));
        rows = rows.concat(study.filter((r) => !seen.has(r.source_id)));
      } catch {
        // study db not present — core sources only
      }
      emit(opts, { sources: rows }, () => rows.map((r) => `${r.title}\n  ${r.url}\n  license: ${r.license}\n  ${r.attribution}`).join('\n\n'));
    });

  program
    .command('morph-codes')
    .description('Explain the morphology fields and their possible values')
    .option('--json', 'output JSON')
    .action((opts: { json?: boolean }) => {
      const db = openStudy();
      const distinct = (col: string, lang?: string): string[] =>
        (db.prepare(`SELECT DISTINCT ${col} v FROM study.words WHERE ${col} IS NOT NULL ${lang ? `AND lang ${lang}` : ''} ORDER BY 1`).all() as Array<{ v: string }>).map((r) => r.v);
      const data = {
        note: "Use these values with 'bible grep-morph'. Raw codes: Hebrew/Aramaic follow OSHM (e.g. HVqp3ms), Greek follows Robinson (e.g. V-PAI-3S); search raw with --morph GLOB.",
        fields: {
          lang: ['H (Hebrew)', 'A (Aramaic)', 'G (Greek)'],
          pos: distinct('pos'),
          stem: distinct('stem', "IN ('H','A')"),
          tense: distinct('tense'),
          voice: distinct('voice', "= 'G'"),
          mood: distinct('mood', "= 'G'"),
          gcase: distinct('gcase', "= 'G'"),
          person: distinct('person'),
          gender: distinct('gender'),
          number: distinct('number_'),
          state: distinct('state', "IN ('H','A')"),
          degree: distinct('degree', "= 'G'"),
        },
      };
      emit(opts, data, () =>
        [data.note, '', ...Object.entries(data.fields).map(([k, v]) => `${k.padEnd(8)} ${(v as string[]).join(', ')}`)].join('\n'),
      );
    });

  program
    .command('ref')
    .description('Parse and normalize a reference. Example: bible ref "jn3.16-18"')
    .argument('<text>', 'reference text in any reasonable format')
    .option('--json', 'output JSON')
    .action((text: string, opts: { json?: boolean }) => {
      try {
        const r = parseRef(text);
        emit(
          opts,
          {
            input: text,
            book: r.book.name,
            book_num: r.book.bookNum,
            kind: r.kind,
            start: { verse_id: r.start, ref: formatVerseId(r.start) },
            end: { verse_id: r.end, ref: formatVerseId(r.end) },
          },
          () => {
            const label =
              r.kind === 'book'
                ? r.book.name
                : r.kind === 'chapter'
                  ? `${r.book.name} ${Math.floor((r.start % 1_000_000) / 1_000)}`
                  : `${formatVerseId(r.start)}${r.end !== r.start ? ` – ${formatVerseId(r.end)}` : ''}`;
            return `${label} (${r.kind}, verse ids ${r.start}–${r.end})`;
          },
        );
      } catch (e) {
        if (e instanceof RefError) fail(opts, e.message, { suggestions: e.suggestions });
        throw e;
      }
    });

  program
    .command('db')
    .description('Manage the local databases: status | download | path')
    .argument('[action]', 'status (default) | download | download-lxx | path', 'status')
    .option('--json', 'output JSON')
    .action(async (action: string, opts: { json?: boolean }) => {
      const st = dbStatus();
      if (action === 'path') {
        emit(opts, { dir: st.dir }, () => st.dir);
        return;
      }
      if (action === 'download-lxx') {
        if (!st.lxx) await downloadArtifact('lxx');
        emit(opts, dbStatus(), () => 'LXX database ready. Note: bible-lxx.db is CC BY-SA 4.0 (see bible licenses).');
        return;
      }
      if (action === 'download') {
        if (!st.core) await downloadArtifact('core');
        if (!st.study) await downloadArtifact('study');
        const after = dbStatus();
        emit(opts, after, () => `data dir: ${after.dir}\ncore:  ${after.core ? `ok (${after.coreMb} MB)` : 'missing'}\nstudy: ${after.study ? `ok (${after.studyMb} MB)` : 'missing'}`);
        return;
      }
      emit(opts, st, () =>
        [
          `data dir: ${st.dir}`,
          `core:  ${st.core ? `ok (${st.coreMb} MB)` : "missing — run 'bible db download'"}`,
          `study: ${st.study ? `ok (${st.studyMb} MB)` : "missing — run 'bible db download' (needed for original-language commands)"}`,
          `lxx:   ${st.lxx ? `ok (${st.lxxMb} MB)` : "not installed — optional; run 'bible db download-lxx' (Septuagint + quotations, CC BY-SA)"}`,
        ].join('\n'),
      );
    });
}
