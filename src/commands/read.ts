import type { Command } from 'commander';
import { formatVerseId, splitVerseId } from '../canon.js';
import { openCore } from '../db/index.js';
import { emit, fail, table } from '../output.js';
import { parseRef, parseScope, RefError } from '../refparse/index.js';

export const DEFAULT_TRANSLATION = process.env.BIBLE_TRANSLATION ?? 'WEB';

interface VerseText {
  verse_id: number;
  translation_id: string;
  text: string;
  bridge_end: number | null;
}

export function refOrFail(opts: { json?: boolean }, ref: string): ReturnType<typeof parseRef> {
  try {
    return parseRef(ref);
  } catch (e) {
    if (e instanceof RefError) fail(opts, e.message, { suggestions: e.suggestions });
    throw e;
  }
}

export function knownTranslations(): string[] {
  return (openCore().prepare('SELECT translation_id FROM translations ORDER BY translation_id').all() as Array<{ translation_id: string }>).map(
    (r) => r.translation_id,
  );
}

export function resolveTranslations(opts: { json?: boolean }, spec: string | undefined): string[] {
  const known = knownTranslations();
  if (!spec) return [DEFAULT_TRANSLATION];
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
    .option('-c, --context <n>', 'include N verses of surrounding context', (v) => parseInt(v, 10))
    .option('--json', 'output JSON')
    .action((refArg: string, opts: { translation?: string; context?: number; json?: boolean }) => {
      const ref = refOrFail(opts, refArg);
      const translations = resolveTranslations(opts, opts.translation);
      let { start, end } = ref;
      if (opts.context && ref.kind !== 'book') {
        start = Math.max(ref.book.bookNum * 1_000_000, start - opts.context);
        end = end + opts.context;
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
    .option('-l, --limit <n>', 'max results (default 20)', (v) => parseInt(v, 10), 20)
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
                `SELECT COUNT(*) n FROM ${ftsTable} WHERE ${ftsTable} MATCH ? AND translation_id IN (${trSql}) AND (${scopeSql})`,
              )
              .get(match, ...translations, ...scopeArgs) as { n: number };
            emit(opts, { query, count: row.n, translations }, () => `${row.n} matching verses`);
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
          if (e instanceof Error && /fts5: syntax error/.test(e.message)) {
            fail(opts, `FTS query syntax error in '${query}'. Try --phrase for literal text, or quote special characters.`);
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
      if (ref.end - ref.start > 10) fail(opts, 'compare works best on short passages; give a verse or a range of up to ~10 verses.');
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
