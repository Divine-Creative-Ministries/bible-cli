import { Command, InvalidArgumentError } from 'commander';
import { formatVerseId, splitVerseId } from '../canon.js';
import { openCore } from '../db/index.js';
import { emit, fail, table } from '../output.js';
import { parseRef, parseScope, RefError } from '../refparse/index.js';

export const DEFAULT_TRANSLATION = (process.env.BIBLE_TRANSLATION ?? 'BSB').trim().toUpperCase();

/** Commander parser: positive integer option values only. */
export function intOpt(value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new InvalidArgumentError('expected a non-negative integer');
  return n;
}

interface VerseText {
  verse_id: number;
  translation_id: string;
  text: string;
  bridge_end: number | null;
}

export function refOrFail(opts: { json?: boolean }, ref: string): ReturnType<typeof parseRef> {
  let parsed: ReturnType<typeof parseRef>;
  try {
    parsed = parseRef(ref);
  } catch (e) {
    if (e instanceof RefError) fail(opts, e.message, { suggestions: e.suggestions });
    throw e;
  }
  // Validate explicit verse endpoints against the spine (sentinel 0/999
  // endpoints from chapter/book forms are internal and skipped).
  try {
    const db = openCore();
    const exists = db.prepare('SELECT 1 FROM verses WHERE verse_id = ?');
    // Explicit 'end' resolves to the chapter's real last verse.
    if (parsed.explicitEnd) {
      for (const key of ['start', 'end'] as const) {
        if (parsed[key] % 1000 === 999) {
          const max = db
            .prepare('SELECT MAX(verse_id) m FROM verses WHERE verse_id BETWEEN ? AND ?')
            .get(parsed[key] - 999, parsed[key]) as { m: number | null };
          if (max.m) parsed[key] = max.m;
        }
      }
    }
    for (const id of parsed.kind === 'verse' ? [parsed.start] : parsed.kind === 'range' ? [parsed.start, parsed.end] : []) {
      const v = id % 1000;
      if (v === 999) continue;
      if (v === 0 && !parsed.explicitTitle) continue;
      if (v === 0 && parsed.explicitTitle) {
        if (!exists.get(id)) {
          fail(opts, `${parsed.book.name} ${Math.floor((id % 1_000_000) / 1_000)} has no superscription (titles exist mainly in Psalms).`);
        }
        continue;
      }
      if (!exists.get(id)) {
        const { bookNum, chapter } = { bookNum: Math.floor(id / 1_000_000), chapter: Math.floor((id % 1_000_000) / 1_000) };
        const max = (db.prepare('SELECT MAX(verse_id % 1000) m FROM verses WHERE book_num = ? AND chapter = ?').get(bookNum, chapter) as { m: number | null }).m;
        fail(
          opts,
          max
            ? `${parsed.book.name} ${chapter} has ${max} verses; verse ${v} does not exist.`
            : `${parsed.book.name} has no chapter ${chapter}.`,
        );
      }
    }
  } catch (e) {
    // No local database yet: skip existence validation, let the command's own
    // db access produce the helpful download message. Anything else is real.
    if (!(e instanceof Error && e.constructor.name === 'DataError')) throw e;
  }
  return parsed;
}

export function knownTranslations(): string[] {
  return (openCore().prepare('SELECT translation_id FROM translations ORDER BY translation_id').all() as Array<{ translation_id: string }>).map(
    (r) => r.translation_id,
  );
}

export function resolveTranslations(opts: { json?: boolean }, spec: string | undefined): string[] {
  const known = knownTranslations();
  if (!spec) {
    if (!known.includes(DEFAULT_TRANSLATION)) {
      fail(opts, `BIBLE_TRANSLATION='${DEFAULT_TRANSLATION}' is not available. Available: ${known.join(', ')}.`);
    }
    return [DEFAULT_TRANSLATION];
  }
  if (spec.toLowerCase() === 'all') return known;
  const ids = spec.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  for (const id of ids) {
    if (!known.includes(id)) {
      fail(opts, `Unknown translation '${id}'. Available: ${known.join(', ')} (or 'all').`);
    }
  }
  return ids;
}

export function versesFor(translation: string, start: number, end: number): VerseText[] {
  const db = openCore();
  return db
    .prepare(
      `SELECT verse_id, translation_id, text, bridge_end FROM verse_texts
       WHERE translation_id = ? AND (verse_id BETWEEN ? AND ?
         OR (bridge_end IS NOT NULL AND verse_id < ? AND bridge_end >= ?))
       ORDER BY verse_id`,
    )
    .all(translation, start, end, start, start) as VerseText[];
}

const shortRef = (verseId: number): string => {
  const { chapter, verse } = splitVerseId(verseId);
  return verse === 0 ? `${chapter}:t` : `${chapter}:${verse}`;
};

export function registerReadCommands(program: Command): void {
  program
    .command('passage')
    .description('Read a passage. Examples: bible passage "John 3:16-18" · bible passage "Psalm 23" -t BSB · bible passage "Gen 1:1" --context 2')
    .argument('<ref>', 'reference, e.g. "John 3:16-18", "jn 3 16", "Psalm 23", "Gen 1-3"')
    .option('-t, --translation <ids>', `translation(s), comma-separated or 'all' (default ${DEFAULT_TRANSLATION})`)
    .option('-c, --context <n>', 'include N verses of surrounding context', intOpt)
    .option('--json', 'output JSON')
    .action((refArg: string, opts: { translation?: string; context?: number; json?: boolean }) => {
      const ref = refOrFail(opts, refArg);
      const translations = resolveTranslations(opts, opts.translation);
      let { start, end } = ref;
      if (opts.context && ref.kind !== 'book') {
        // Walk the spine, not verse-id arithmetic — context crosses chapters.
        const db = openCore();
        const before = db
          .prepare('SELECT MIN(verse_id) v FROM (SELECT verse_id FROM verses WHERE verse_id < ? AND book_num = ? ORDER BY verse_id DESC LIMIT ?)')
          .get(start, ref.book.bookNum, opts.context) as { v: number | null };
        const after = db
          .prepare('SELECT MAX(verse_id) v FROM (SELECT verse_id FROM verses WHERE verse_id > ? AND book_num = ? ORDER BY verse_id LIMIT ?)')
          .get(end, ref.book.bookNum, opts.context) as { v: number | null };
        if (before.v !== null) start = before.v;
        if (after.v !== null) end = after.v;
      }
      const result = translations.map((t) => ({
        translation: t,
        verses: versesFor(t, start, end).map((v) => ({
          ref: formatVerseId(v.verse_id),
          verse_id: v.verse_id,
          text: v.text,
          ...(v.bridge_end ? { bridged_through: formatVerseId(v.bridge_end) } : {}),
        })),
      }));
      if (result.every((r) => r.verses.length === 0)) {
        fail(opts, `No text found for '${refArg}'. The verse may not exist in ${translations.join('/')}.`);
      }
      emit(opts, { ref: formatVerseId(ref.start) + (ref.end !== ref.start ? ` – ${formatVerseId(ref.end)}` : ''), passages: result }, () =>
        result
          .map((r) =>
            [`[${r.translation}] ${ref.book.name}`, ...r.verses.map((v) => `  ${shortRef(v.verse_id)}  ${v.text}`)].join('\n'),
          )
          .join('\n\n'),
      );
    });

  program
    .command('search')
    .description('Full-text search. Examples: bible search "living water" · bible search "covenant" --book Genesis --count · bible search "mercy endures" -t KJV --stem')
    .argument('<query>', 'words or "quoted phrase"; supports FTS5 syntax (AND, OR, NOT, NEAR)')
    .option('-t, --translation <ids>', `translation(s) (default ${DEFAULT_TRANSLATION})`)
    .option('-b, --book <scope>', "limit to book/range/testament: 'Isaiah', 'Gen-Deu', 'ot', 'nt'")
    .option('--phrase', 'treat the query as an exact phrase')
    .option('--stem', 'stemmed search (matches loved/loving/loves for love)')
    .option('--count', 'print only the match count')
    .option('-l, --limit <n>', 'max results (default 20)', intOpt, 20)
    .option('--json', 'output JSON')
    .action(
      (
        query: string,
        opts: {
          translation?: string;
          book?: string;
          phrase?: boolean;
          stem?: boolean;
          count?: boolean;
          limit: number;
          json?: boolean;
        },
      ) => {
        const db = openCore();
        const translations = resolveTranslations(opts, opts.translation);
        const ftsTable = opts.stem ? 'verse_fts_stem' : 'verse_fts';
        // Plain word queries get each token quoted so apostrophes/hyphens
        // (God's, Baal-zebub) don't trip FTS5 syntax; explicit operators pass
        // through. Source texts use typographic apostrophes (U+2019), so
        // normalize ASCII ' to match the index.
        const q = query.replace(/'/g, '’');
        const hasOperators = /["*()^]|\b(AND|OR|NOT|NEAR)\b/.test(q);
        const match = opts.phrase
          ? `"${q.replace(/"/g, '""')}"`
          : hasOperators
            ? q
            : q.trim().split(/\s+/).map((t) => `"${t.replace(/"/g, '""')}"`).join(' ');

        let scope: Array<{ start: number; end: number }> = [{ start: 0, end: 99_999_999 }];
        if (opts.book) {
          try {
            scope = parseScope(opts.book);
          } catch (e) {
            if (e instanceof RefError) fail(opts, e.message);
            throw e;
          }
        }
        const scopeSql = scope.map(() => '(verse_id BETWEEN ? AND ?)').join(' OR ');
        const scopeArgs = scope.flatMap((s) => [s.start, s.end]);
        const trSql = translations.map(() => '?').join(',');

        try {
          if (opts.count) {
            const row = db
              .prepare(
                `SELECT COUNT(DISTINCT verse_id) verses, COUNT(*) hits FROM ${ftsTable} WHERE ${ftsTable} MATCH ? AND translation_id IN (${trSql}) AND (${scopeSql})`,
              )
              .get(match, ...translations, ...scopeArgs) as { verses: number; hits: number };
            emit(opts, { query, matching_verses: row.verses, translation_hits: row.hits, translations }, () =>
              `${row.verses} matching verses` + (row.hits !== row.verses ? ` (${row.hits} translation renderings)` : ''),
            );
            return;
          }
          const rows = db
            .prepare(
              `SELECT verse_id, translation_id, snippet(${ftsTable}, 0, '>>', '<<', '…', 32) snip
               FROM ${ftsTable} WHERE ${ftsTable} MATCH ? AND translation_id IN (${trSql}) AND (${scopeSql})
               ORDER BY verse_id LIMIT ?`,
            )
            .all(match, ...translations, ...scopeArgs, opts.limit + 1) as Array<{
            verse_id: number;
            translation_id: string;
            snip: string;
          }>;
          const truncated = rows.length > opts.limit;
          const shown = truncated ? rows.slice(0, opts.limit) : rows;
          emit(
            opts,
            {
              query,
              translations,
              count_shown: shown.length,
              truncated,
              hint: truncated ? `More matches exist; raise --limit or use --count.` : undefined,
              results: shown.map((r) => ({
                ref: formatVerseId(r.verse_id),
                verse_id: r.verse_id,
                translation: r.translation_id,
                snippet: r.snip,
              })),
            },
            () =>
              table(shown.map((r) => [formatVerseId(r.verse_id), `[${r.translation_id}]`, r.snip])) +
              (truncated ? `\n… more matches exist (use --limit or --count)` : ''),
          );
        } catch (e) {
          if (e instanceof Error && (e.constructor.name === 'SqliteError' || /fts5/.test(e.message))) {
            fail(opts, `Cannot parse search query '${query}' (${e.message.replace(/^.*: /, '')}). Try --phrase for literal text, or quote special characters.`);
          }
          throw e;
        }
      },
    );

  program
    .command('compare')
    .description('Compare a verse across translations. Example: bible compare "Rom 8:1" -t all')
    .argument('<ref>', 'reference (single verse or short range)')
    .option('-t, --translation <ids>', "translations to compare (default 'all')")
    .option('--json', 'output JSON')
    .action((refArg: string, opts: { translation?: string; json?: boolean }) => {
      const ref = refOrFail(opts, refArg);
      const translations = resolveTranslations(opts, opts.translation ?? 'all');
      const nInRange = (openCore().prepare('SELECT COUNT(*) n FROM verses WHERE verse_id BETWEEN ? AND ?').get(ref.start, ref.end) as { n: number }).n;
      if (nInRange > 10) fail(opts, `compare works best on short passages (${nInRange} verses requested, max 10). Narrow the range.`);
      const out = [] as Array<{ ref: string; verse_id: number; renderings: Record<string, string> }>;
      for (let id = ref.start; id <= ref.end; id++) {
        const renderings: Record<string, string> = {};
        for (const t of translations) {
          const rows = versesFor(t, id, id);
          if (rows.length > 0) renderings[t] = rows[0]!.text;
        }
        if (Object.keys(renderings).length > 0) out.push({ ref: formatVerseId(id), verse_id: id, renderings });
      }
      if (out.length === 0) fail(opts, `No text found for '${refArg}'.`);
      emit(opts, { comparisons: out }, () =>
        out
          .map((v) => [v.ref, ...translations.filter((t) => v.renderings[t]).map((t) => `  ${t.padEnd(4)} ${v.renderings[t]}`)].join('\n'))
          .join('\n\n'),
      );
    });
}
