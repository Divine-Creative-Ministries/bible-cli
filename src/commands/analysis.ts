import type { Command } from 'commander';
import { byBookNum, formatVerseId } from '../canon.js';
import { openCore, openStudy } from '../db/index.js';
import { emit, fail, table } from '../output.js';
import { parseScope, RefError } from '../refparse/index.js';
import { DEFAULT_TRANSLATION, intOpt, refOrFail, resolveTranslations, versesFor } from './read.js';

const bookName = (n: number): string => byBookNum.get(n)?.name ?? `book${n}`;

function parseStrongsList(opts: { json?: boolean }, items: string[]): Array<{ num: number; lang: string }> {
  return items.map((s) => {
    const m = s.trim().match(/^([HGhg])(\d{1,4})$/);
    if (!m) fail(opts, `'${s}' is not a Strong's number like H2617 or G26.`);
    return { lang: m![1]!.toUpperCase(), num: parseInt(m![2]!, 10) };
  });
}

export function registerAnalysisCommands(program: Command): void {
  program
    .command('xref')
    .description('Ranked cross-references. Example: bible xref "Isa 53:5" --text --min-votes 20')
    .argument('<ref>', 'source reference (verse or short range)')
    .option('--min-votes <n>', 'minimum helpfulness votes (default 5)', intOpt, 5)
    .option('--text', 'include the target verse text')
    .option('-t, --translation <id>', `translation for --text (default ${DEFAULT_TRANSLATION})`)
    .option('--reverse', 'also list verses that reference THIS verse')
    .option('-l, --limit <n>', 'max results (default 20)', intOpt, 20)
    .option('--json', 'output JSON')
    .action(
      (
        refArg: string,
        opts: { minVotes: number; text?: boolean; translation?: string; reverse?: boolean; limit: number; json?: boolean },
      ) => {
        const ref = refOrFail(opts, refArg);
        const db = openCore();
        const rows = db
          .prepare(
            `SELECT from_verse_id, to_verse_start, to_verse_end, votes FROM cross_refs
             WHERE from_verse_id BETWEEN ? AND ? AND votes >= ? ORDER BY votes DESC LIMIT ?`,
          )
          .all(ref.start, ref.end, opts.minVotes, opts.limit) as Array<{
          from_verse_id: number;
          to_verse_start: number;
          to_verse_end: number;
          votes: number;
        }>;
        const reverse = opts.reverse
          ? (db
              .prepare(
                `SELECT from_verse_id, votes FROM cross_refs
                 WHERE to_verse_start <= ? AND to_verse_end >= ? AND votes >= ? ORDER BY votes DESC LIMIT ?`,
              )
              .all(ref.end, ref.start, opts.minVotes, opts.limit) as Array<{ from_verse_id: number; votes: number }>)
          : [];
        if (rows.length === 0 && reverse.length === 0) {
          fail(opts, `No cross-references at or above ${opts.minVotes} votes for '${refArg}'. Lower --min-votes.`);
        }
        const tr = resolveTranslations(opts, opts.translation)[0]!;
        const fmtRange = (a: number, z: number): string => (a === z ? formatVerseId(a) : `${formatVerseId(a)}–${formatVerseId(z)}`);
        const textFor = (a: number, z: number): string | undefined =>
          opts.text ? versesFor(tr, a, z).map((v) => v.text).join(' ') : undefined;

        emit(
          opts,
          {
            ref: formatVerseId(ref.start),
            cross_references: rows.map((r) => ({
              from: formatVerseId(r.from_verse_id),
              to: fmtRange(r.to_verse_start, r.to_verse_end),
              votes: r.votes,
              ...(opts.text ? { text: textFor(r.to_verse_start, r.to_verse_end) } : {}),
            })),
            ...(opts.reverse
              ? {
                  referenced_by: reverse.map((r) => ({
                    from: formatVerseId(r.from_verse_id),
                    votes: r.votes,
                    ...(opts.text ? { text: textFor(r.from_verse_id, r.from_verse_id) } : {}),
                  })),
                }
              : {}),
          },
          () =>
            table(
              rows.map((r) => [
                fmtRange(r.to_verse_start, r.to_verse_end),
                `${r.votes}`,
                textFor(r.to_verse_start, r.to_verse_end) ?? '',
              ]),
            ) +
            (reverse.length
              ? `\n\nreferenced by:\n` + table(reverse.map((r) => [formatVerseId(r.from_verse_id), `${r.votes}`, textFor(r.from_verse_id, r.from_verse_id) ?? '']))
              : ''),
        );
      },
    );

  program
    .command('freq')
    .description("Frequency distribution. Examples: bible freq --strongs H2617 --by-book · bible freq --word covenant -t KJV")
    .option('--strongs <id>', "Strong's number (true token counts from tagged text)")
    .option('--lemma <l>', 'original-language lemma')
    .option('--word <w>', 'English word (counts verses containing it, per translation)')
    .option('-t, --translation <id>', `translation for --word (default ${DEFAULT_TRANSLATION})`)
    .option('--by-book', 'group by book (default)')
    .option('--by-testament', 'group by testament')
    .option('--json', 'output JSON')
    .action((opts: { strongs?: string; lemma?: string; word?: string; translation?: string; byBook?: boolean; byTestament?: boolean; json?: boolean }) => {
      const groupExpr = opts.byTestament
        ? "CASE WHEN verse_id < 40000000 THEN 'OT' ELSE 'NT' END"
        : 'CAST(verse_id/1000000 AS INT)';
      const label = (g: string | number): string => (typeof g === 'number' ? bookName(g) : String(g));

      if (opts.strongs || opts.lemma) {
        const db = openStudy();
        let where: string;
        let args: unknown[];
        if (opts.strongs) {
          const st = parseStrongsList(opts, [opts.strongs])[0]!;
          where = `strongs_num = ? AND lang ${st.lang === 'H' ? "IN ('H','A')" : "= 'G'"}`;
          args = [st.num];
        } else {
          const norm = opts.lemma!.normalize('NFD').replace(/[֑-ׇ̀-ͯ]/g, '').replace(/ς/g, 'σ').toLowerCase().normalize('NFC');
          where = '(lemma_norm = ? OR lemma = ?)';
          args = [norm, opts.lemma];
        }
        const rows = db
          .prepare(
            `SELECT ${groupExpr} g, COUNT(*) n FROM study.words WHERE ${where} AND is_default=1 GROUP BY g ORDER BY MIN(verse_id)`,
          )
          .all(...args) as Array<{ g: number | string; n: number }>;
        if (rows.length === 0) fail(opts, `No occurrences of ${opts.strongs ?? opts.lemma}.`);
        const total = rows.reduce((s, r) => s + r.n, 0);
        emit(opts, { query: opts.strongs ?? opts.lemma, total, distribution: rows.map((r) => ({ group: label(r.g), count: r.n })) }, () =>
          [`${total} occurrences`, ...rows.map((r) => `  ${label(r.g).padEnd(16)} ${String(r.n).padStart(5)}  ${'█'.repeat(Math.max(1, Math.round((r.n / total) * 60)))}`)].join('\n'),
        );
        return;
      }

      if (opts.word) {
        const db = openCore();
        const tr = resolveTranslations(opts, opts.translation)[0]!;
        const rows = db
          .prepare(
            `SELECT ${groupExpr} g, COUNT(*) n FROM verse_fts WHERE verse_fts MATCH ? AND translation_id = ? GROUP BY g ORDER BY MIN(verse_id)`,
          )
          .all(`"${opts.word.replace(/"/g, '')}"`, tr) as Array<{ g: number | string; n: number }>;
        if (rows.length === 0) fail(opts, `No verses contain '${opts.word}' in ${tr}.`);
        const total = rows.reduce((s, r) => s + r.n, 0);
        emit(
          opts,
          { word: opts.word, translation: tr, total_verses: total, note: 'counts are verses containing the word', distribution: rows.map((r) => ({ group: label(r.g), verses: r.n })) },
          () =>
            [`${total} verses contain '${opts.word}' in ${tr}`, ...rows.map((r) => `  ${label(r.g).padEnd(16)} ${String(r.n).padStart(5)}  ${'█'.repeat(Math.max(1, Math.round((r.n / total) * 60)))}`)].join('\n'),
        );
        return;
      }
      fail(opts, 'Give one of --strongs, --lemma, or --word. Example: bible freq --strongs H2617 --by-book');
    });

  program
    .command('cooccur')
    .description("Co-occurrence analysis. Examples: bible cooccur --strongs H2617 --strongs H1285 · bible cooccur 'Rom 3:21-26'")
    .argument('[ref]', 'profile mode: list the distinctive vocabulary of a passage')
    .option('--strongs <id...>', "two or more Strong's numbers: find verses containing all of them")
    .option('--window <w>', "'verse' (default) or 'chapter'", 'verse')
    .option('-l, --limit <n>', 'max results (default 30)', intOpt, 30)
    .option('--json', 'output JSON')
    .action((refArg: string | undefined, opts: { strongs?: string[]; window: string; limit: number; json?: boolean }) => {
      const db = openStudy();

      if (opts.strongs && opts.strongs.length >= 2) {
        const sts = parseStrongsList(opts, opts.strongs);
        const unit = opts.window === 'chapter' ? 'CAST(verse_id/1000 AS INT)' : 'verse_id';
        const sub = sts
          .map((s) => `SELECT DISTINCT ${unit} u FROM study.words WHERE strongs_num = ? AND lang ${s.lang === 'H' ? "IN ('H','A')" : "= 'G'"} AND is_default=1`)
          .join(' INTERSECT ');
        const rows = db.prepare(`${sub} ORDER BY u LIMIT ?`).all(...sts.map((s) => s.num), opts.limit) as Array<{ u: number }>;
        if (rows.length === 0) fail(opts, `No ${opts.window}s contain all of: ${opts.strongs.join(', ')}.`);
        const fmt = (u: number): string => (opts.window === 'chapter' ? formatVerseId(u * 1000 + 1).replace(/:1$/, '') : formatVerseId(u));
        emit(opts, { strongs: opts.strongs, window: opts.window, count: rows.length, locations: rows.map((r) => fmt(r.u)) }, () =>
          [`${rows.length} ${opts.window}s contain all of ${opts.strongs!.join(' + ')}:`, ...rows.map((r) => `  ${fmt(r.u)}`)].join('\n'),
        );
        return;
      }

      if (!refArg) fail(opts, "Give a passage (profile mode) or at least two --strongs. Example: bible cooccur --strongs H2617 --strongs H1285");
      const ref = refOrFail(opts, refArg!);
      // Profile: lemmas in the passage, with corpus frequency — rare words are thematically loaded.
      const rows = db
        .prepare(
          `WITH inpass AS (
             SELECT strongs, lemma, MIN(gloss) gloss, COUNT(*) n FROM study.words
             WHERE verse_id BETWEEN ? AND ? AND is_default=1 AND strongs IS NOT NULL
               AND (strongs_num < 9000 OR lang='G')
             GROUP BY strongs
           )
           SELECT i.strongs, i.lemma, i.gloss, i.n in_passage,
                  (SELECT COUNT(*) FROM study.words w WHERE w.strongs = i.strongs AND w.is_default=1) corpus
           FROM inpass i ORDER BY corpus ASC, in_passage DESC LIMIT ?`,
        )
        .all(ref.start, ref.end, opts.limit) as Array<{ strongs: string; lemma: string; gloss: string; in_passage: number; corpus: number }>;
      if (rows.length === 0) fail(opts, `No tagged words found in '${refArg}'.`);
      emit(
        opts,
        {
          ref: refArg,
          note: 'sorted rarest-first: low corpus counts mark distinctive vocabulary',
          vocabulary: rows.map((r) => ({ strongs: r.strongs, lemma: r.lemma, gloss: r.gloss, in_passage: r.in_passage, in_corpus: r.corpus })),
        },
        () =>
          `Distinctive vocabulary of ${refArg} (rarest first):\n` +
          table([['strongs', 'lemma', 'gloss', 'here', 'corpus'], ...rows.map((r) => [r.strongs, r.lemma ?? '', (r.gloss ?? '').slice(0, 28), String(r.in_passage), String(r.corpus)])]),
      );
    });
}
