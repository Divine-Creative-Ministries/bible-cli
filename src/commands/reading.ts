import type { Command } from 'commander';
import { BOOKS, byBookNum, formatVerseId, makeVerseId, splitVerseId } from '../canon.js';
import { openCore, openStudy } from '../db/index.js';
import { emit, fail, table } from '../output.js';
import { parseRef, RefError } from '../refparse/index.js';
import { DEFAULT_TRANSLATION, intOpt, refOrFail, resolveTranslations } from './read.js';

/**
 * Reading commands: sequential digestion rather than targeted queries.
 * `read` pages through the text in context-window-sized chunks; `outline`
 * shows a whole book's shape in one call. Together they support the human
 * pattern of study — read first, let themes emerge, then interrogate.
 */

interface ChapterText {
  bookNum: number;
  chapter: number;
  text: string; // flowed text with [v] markers
  chars: number;
}

export function chunkChapters(chapters: ChapterText[], chunkSize: number): ChapterText[][] {
  const chunks: ChapterText[][] = [];
  let current: ChapterText[] = [];
  let size = 0;
  for (const ch of chapters) {
    if (current.length > 0 && size + ch.chars > chunkSize) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(ch);
    size += ch.chars;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

function loadChapters(translation: string, start: number, end: number): ChapterText[] {
  const db = openCore();
  const rows = db
    .prepare(
      `SELECT verse_id, text FROM verse_texts
       WHERE translation_id = ? AND verse_id BETWEEN ? AND ? ORDER BY verse_id`,
    )
    .all(translation, start, end) as Array<{ verse_id: number; text: string }>;
  const byChapter = new Map<string, { bookNum: number; chapter: number; parts: string[] }>();
  for (const r of rows) {
    const { bookNum, chapter, verse } = splitVerseId(r.verse_id);
    const key = `${bookNum}:${chapter}`;
    if (!byChapter.has(key)) byChapter.set(key, { bookNum, chapter, parts: [] });
    byChapter.get(key)!.parts.push(verse === 0 ? `⟨${r.text}⟩` : `[${verse}] ${r.text}`);
  }
  return [...byChapter.values()].map((c) => {
    const text = c.parts.join(' ');
    return { bookNum: c.bookNum, chapter: c.chapter, text, chars: text.length };
  });
}

export function registerReadingCommands(program: Command): void {
  program
    .command('read')
    .description(
      "Read the text sequentially, paged into context-sized chunks — study by reading, not just querying. Examples: bible read Isaiah · bible read Isaiah --chunk 3 · bible read random",
    )
    .argument('<scope>', "a book ('Isaiah'), chapter/range ('Isaiah 40-55'), or 'random' for a random chapter")
    .option('-t, --translation <id>', `translation (default ${DEFAULT_TRANSLATION})`)
    .option('--chunk <n>', 'which chunk to read (1-based; default 1)', intOpt, 1)
    .option('--chunk-size <chars>', 'target characters per chunk (default 12000)', intOpt, 12000)
    .option('--json', 'output JSON')
    .action((scope: string, opts: { translation?: string; chunk: number; chunkSize: number; json?: boolean }) => {
      const tr = resolveTranslations(opts, opts.translation)[0]!;

      let start: number;
      let end: number;
      let label: string;
      if (scope.trim().toLowerCase() === 'random') {
        const book = BOOKS[Math.floor(Math.random() * BOOKS.length)]!;
        const chapter = 1 + Math.floor(Math.random() * book.chapters);
        start = makeVerseId(book.bookNum, chapter, 0);
        end = makeVerseId(book.bookNum, chapter, 999);
        label = `${book.name} ${chapter}`;
      } else {
        let ref: ReturnType<typeof parseRef>;
        try {
          ref = refOrFail(opts, scope);
        } catch (e) {
          if (e instanceof RefError) fail(opts, e.message);
          throw e;
        }
        start = ref.start;
        end = ref.end;
        label = scope;
      }

      const chapters = loadChapters(tr, start, end);
      if (chapters.length === 0) fail(opts, `No text found for '${scope}' in ${tr}.`);
      const chunks = chunkChapters(chapters, opts.chunkSize);
      if (opts.chunk < 1 || opts.chunk > chunks.length) {
        fail(opts, `'${label}' has ${chunks.length} chunk${chunks.length === 1 ? '' : 's'} at this size; --chunk ${opts.chunk} is out of range.`);
      }
      const chunk = chunks[opts.chunk - 1]!;
      const first = chunk[0]!;
      const last = chunk[chunk.length - 1]!;
      const rangeLabel =
        first.bookNum === last.bookNum
          ? `${byBookNum.get(first.bookNum)!.name} ${first.chapter}${last.chapter !== first.chapter ? `–${last.chapter}` : ''}`
          : `${byBookNum.get(first.bookNum)!.name} ${first.chapter} – ${byBookNum.get(last.bookNum)!.name} ${last.chapter}`;
      const nav = {
        chunk: opts.chunk,
        of: chunks.length,
        covers: rangeLabel,
        ...(opts.chunk < chunks.length ? { next: `bible read "${label}" --chunk ${opts.chunk + 1}` } : {}),
        ...(opts.chunk > 1 ? { prev: `bible read "${label}" --chunk ${opts.chunk - 1}` } : {}),
      };

      emit(
        opts,
        {
          scope: label,
          translation: tr,
          nav,
          note: 'Superscriptions appear in ⟨angle brackets⟩; [n] marks verse numbers for citation.',
          chapters: chunk.map((c) => ({
            ref: `${byBookNum.get(c.bookNum)!.name} ${c.chapter}`,
            text: c.text,
          })),
        },
        () =>
          [
            `── ${rangeLabel} [${tr}] · chunk ${opts.chunk}/${chunks.length} ──`,
            '',
            ...chunk.map((c) => `¶ ${byBookNum.get(c.bookNum)!.name} ${c.chapter}\n${c.text}`),
            '',
            opts.chunk < chunks.length
              ? `→ continue: bible read "${label}" --chunk ${opts.chunk + 1}`
              : `✓ end of ${label}`,
          ].join('\n'),
      );
    });

  program
    .command('outline')
    .description(
      'The shape of a whole book in one call: every chapter with its opening words, size, and most distinctive vocabulary. Example: bible outline Isaiah',
    )
    .argument('<book>', "a book name, or a range like 'Isaiah 40-55'")
    .option('-t, --translation <id>', `translation for incipits (default ${DEFAULT_TRANSLATION})`)
    .option('--json', 'output JSON')
    .action((bookArg: string, opts: { translation?: string; json?: boolean }) => {
      const tr = resolveTranslations(opts, opts.translation)[0]!;
      const ref = refOrFail(opts, bookArg);
      const core = openCore();

      // distinctive vocabulary per chapter (graceful without the study db)
      let vocabFor: ((start: number, end: number) => string) | null = null;
      try {
        const study = openStudy();
        const q = study.prepare(
          `WITH inch AS (
             SELECT strongs, MAX(lemma) lemma, MAX(gloss) gloss FROM study.words
             WHERE verse_id BETWEEN ? AND ? AND is_default=1 AND strongs IS NOT NULL AND strongs_num < 9000
             GROUP BY strongs)
           SELECT lemma, gloss,
                  (SELECT COUNT(*) FROM study.words w WHERE w.strongs = inch.strongs AND w.is_default=1) corpus
           FROM inch ORDER BY corpus ASC LIMIT 2`,
        );
        vocabFor = (a, b) =>
          (q.all(a, b) as Array<{ lemma: string; gloss: string; corpus: number }>)
            .map((r) => `${r.lemma ?? ''}${r.gloss ? ` “${r.gloss.trim()}”` : ''}`)
            .join(', ');
      } catch {
        // study db absent: outline still works from core alone
      }

      const chapters = core
        .prepare(
          `SELECT CAST(verse_id/1000000 AS INT) b, CAST((verse_id % 1000000)/1000 AS INT) c,
                  COUNT(*) verses
           FROM verse_texts WHERE translation_id = ? AND verse_id BETWEEN ? AND ? AND verse_id % 1000 != 0
           GROUP BY b, c ORDER BY MIN(verse_id)`,
        )
        .all(tr, ref.start, ref.end) as Array<{ b: number; c: number; verses: number }>;
      if (chapters.length === 0) fail(opts, `No chapters found for '${bookArg}'.`);

      const incipitQ = core.prepare(
        `SELECT text FROM verse_texts WHERE translation_id = ? AND verse_id BETWEEN ? AND ? AND verse_id % 1000 != 0 ORDER BY verse_id LIMIT 1`,
      );
      const rows = chapters.map((ch) => {
        const a = makeVerseId(ch.b, ch.c, 0);
        const z = makeVerseId(ch.b, ch.c, 999);
        const incipit = ((incipitQ.get(tr, a, z) as { text: string } | undefined)?.text ?? '')
          .split(/\s+/)
          .slice(0, 9)
          .join(' ');
        return {
          ref: `${byBookNum.get(ch.b)!.name} ${ch.c}`,
          verses: ch.verses,
          incipit: incipit + '…',
          distinctive: vocabFor ? vocabFor(a, z) : undefined,
        };
      });

      emit(
        opts,
        {
          scope: bookArg,
          translation: tr,
          chapters: rows,
          hint: `Read sequentially with: bible read "${bookArg}"`,
        },
        () =>
          table(
            rows.map((r) => [r.ref, `${r.verses}v`, `“${r.incipit}”`, r.distinctive ?? '']),
          ) + `\n\n→ read it: bible read "${bookArg}"`,
      );
    });
}
