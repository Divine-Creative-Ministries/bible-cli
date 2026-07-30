import type { Command } from 'commander';
import { byBookNum, formatVerseId } from '../canon.js';
import { openStudy } from '../db/index.js';
import { emit, fail, table } from '../output.js';
import { parseScope, RefError } from '../refparse/index.js';
import { intOpt } from './read.js';

/** One item of a formula: a Strong's number or an original-script lemma. */
export type FormulaItem =
  | { kind: 'strongs'; raw: string; lang: 'H' | 'G'; num: number; suffix?: string }
  | { kind: 'lemma'; raw: string; norm: string };

/** Same lemma normalization the analysis commands use for --lemma. */
export function normalizeLemma(s: string): string {
  return s.normalize('NFD').replace(/[֑-ׇ̀-ͯ]/g, '').replace(/ς/g, 'σ').toLowerCase().normalize('NFC');
}

/**
 * Parse a space-separated formula of Strong's numbers (H430, G26, H2617a) and
 * original-script lemmas. English words are rejected — this is an
 * original-language search.
 */
export function parseFormula(formula: string): { items: FormulaItem[] } | { error: string } {
  const tokens = formula.trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 2) {
    return { error: "A formula needs at least two items (e.g. --formula \"H2142 H1285\"). For a single term use 'bible lemma'." };
  }
  const items: FormulaItem[] = [];
  for (const t of tokens) {
    const m = t.match(/^([HGhg])(\d{1,4})([A-Za-z]?)$/);
    if (m) {
      items.push({
        kind: 'strongs',
        raw: t,
        lang: m[1]!.toUpperCase() as 'H' | 'G',
        num: parseInt(m[2]!, 10),
        ...(m[3] ? { suffix: m[3] } : {}),
      });
      continue;
    }
    if (/^[A-Za-z'’-]+$/.test(t)) {
      return {
        error: `'${t}' looks like an English word. Formulas are original-language only: use Strong's numbers (H430, G26) or original-script lemmas (אֱלֹהִים, ἀγάπη). Find a word's Strong's number with 'bible word ${t}'.`,
      };
    }
    items.push({ kind: 'lemma', raw: t, norm: normalizeLemma(t) });
  }
  return { items };
}

/**
 * Observed-vs-expected concentration by book. Expected for a book = its share
 * of default-stream word tokens within the scope × the total match count.
 * Pure so it is unit-testable.
 */
export function concentration(
  observed: Map<number, number>,
  tokensByBook: Map<number, number>,
  totalMatches: number,
): Array<{ book_num: number; observed: number; expected: number; ratio: number }> {
  const scopeTokens = [...tokensByBook.values()].reduce((a, b) => a + b, 0);
  return [...observed.entries()]
    .map(([bookNum, n]) => {
      const share = scopeTokens > 0 ? (tokensByBook.get(bookNum) ?? 0) / scopeTokens : 0;
      const expected = totalMatches * share;
      return {
        book_num: bookNum,
        observed: n,
        expected: Math.round(expected * 10) / 10,
        ratio: expected > 0 ? Math.round((n / expected) * 10) / 10 : Infinity,
      };
    })
    .sort((a, z) => z.observed - a.observed || a.book_num - z.book_num);
}

interface SlotPart {
  verse_id: number;
  word_num: number;
  part_num: number;
  lang: string;
  surface: string;
  strongs_num: number | null;
  strongs_suffix: string | null;
  lemma: string | null;
  lemma_norm: string | null;
}

function partMatches(p: SlotPart, item: FormulaItem): boolean {
  if (item.kind === 'strongs') {
    if (p.strongs_num !== item.num) return false;
    const langOk = item.lang === 'G' ? p.lang === 'G' : p.lang === 'H' || p.lang === 'A';
    if (!langOk) return false;
    return item.suffix ? p.strongs_suffix === item.suffix : true;
  }
  return p.lemma_norm === item.norm || p.lemma === item.raw;
}

/**
 * Find occurrences of the formula in one verse's default-stream slots.
 * Slots are whole words (grouped morphemes) ordered by word_num; slack is the
 * max number of intervening word slots allowed between consecutive items.
 * Returns [startSlot, endSlot] index pairs (into the ordered slot list).
 * Backtracks over candidate positions (greedy earliest-next can miss valid
 * completions, e.g. items A,C over slots A,B,B,-,C with slack 1), memoizing
 * (item, position) so the search stays linear in slots × items × slack.
 */
export function findSequences(slotMatches: boolean[][], nItems: number, slack: number): Array<[number, number]> {
  // memo.get(t * nSlots + pos): end slot of a completion of items t.. with
  // item t matched at pos, or -1 when impossible.
  const memo = new Map<number, number>();
  const solve = (t: number, pos: number): number => {
    if (t === nItems - 1) return pos;
    const key = t * slotMatches.length + pos;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    let result = -1;
    for (let j = pos + 1; j <= Math.min(pos + 1 + slack, slotMatches.length - 1); j++) {
      if (slotMatches[j]![t + 1] && solve(t + 1, j) !== -1) {
        result = solve(t + 1, j);
        break;
      }
    }
    memo.set(key, result);
    return result;
  };
  const found: Array<[number, number]> = [];
  for (let start = 0; start < slotMatches.length; start++) {
    if (!slotMatches[start]![0]) continue;
    const end = solve(0, start);
    if (end !== -1) found.push([start, end]);
  }
  return found;
}

export function registerPatternCommand(program: Command): void {
  program
    .command('pattern')
    .description(
      'Original-language formula search: find verses where a sequence of Strong\'s numbers and/or original-script lemmas occurs in order, with observed-vs-expected concentration by book. Original-language only — English words are not accepted (find Strong\'s numbers with \'bible word\'). Example: bible pattern --formula "H2142 H1285"',
    )
    .requiredOption('--formula <items>', "space-separated Strong's numbers (H430, G26, H2617a) and/or original-script lemmas, in order")
    .option('--scope <s>', "limit scope: 'ot', 'nt', a book, or a range ('Gen-Deu')")
    .option('--slack <n>', 'max intervening words allowed between consecutive items (default 0)', intOpt, 0)
    .option('-l, --limit <n>', 'max sample matches listed (default 20)', intOpt, 20)
    .option('--json', 'output JSON')
    .action((opts: { formula: string; scope?: string; slack: number; limit: number; json?: boolean }) => {
      const parsed = parseFormula(opts.formula);
      if ('error' in parsed) fail(opts, parsed.error);
      const items = parsed.items;
      const db = openStudy();

      let scope: Array<{ start: number; end: number }> = [{ start: 1_000_000, end: 66_999_999 }];
      if (opts.scope) {
        try {
          scope = parseScope(opts.scope);
        } catch (e) {
          if (e instanceof RefError) fail(opts, e.message);
          throw e;
        }
      }
      const scopeSql = '(' + scope.map(() => 'verse_id BETWEEN ? AND ?').join(' OR ') + ')';
      const scopeArgs = scope.flatMap((s) => [s.start, s.end]);

      // Candidate verses: every formula item present (order checked in JS).
      const itemSql = (item: FormulaItem): { sql: string; args: unknown[] } =>
        item.kind === 'strongs'
          ? {
              sql: `strongs_num = ? AND lang ${item.lang === 'H' ? "IN ('H','A')" : "= 'G'"}` + (item.suffix ? ' AND strongs_suffix = ?' : ''),
              args: item.suffix ? [item.num, item.suffix] : [item.num],
            }
          : { sql: '(lemma_norm = ? OR lemma = ?)', args: [item.norm, item.raw] };
      const sub = items
        .map((it) => `SELECT DISTINCT verse_id FROM study.words WHERE ${itemSql(it).sql} AND is_default = 1 AND ${scopeSql}`)
        .join(' INTERSECT ');
      const candidates = (
        db.prepare(`${sub} ORDER BY verse_id`).all(...items.flatMap((it) => [...itemSql(it).args, ...scopeArgs])) as Array<{ verse_id: number }>
      ).map((r) => r.verse_id);

      const verseStmt = db.prepare(
        `SELECT verse_id, word_num, part_num, lang, surface, strongs_num, strongs_suffix, lemma, lemma_norm
         FROM study.words WHERE verse_id = ? AND is_default = 1 ORDER BY word_num, part_num`,
      );

      const matches: Array<{ verse_id: number; text: string }> = [];
      const observed = new Map<number, number>();
      let total = 0;
      for (const vid of candidates) {
        const parts = verseStmt.all(vid) as SlotPart[];
        // Group morphemes into word slots ordered by word_num.
        const slotMap = new Map<number, SlotPart[]>();
        for (const p of parts) {
          if (!slotMap.has(p.word_num)) slotMap.set(p.word_num, []);
          slotMap.get(p.word_num)!.push(p);
        }
        const slots = [...slotMap.entries()].sort((a, z) => a[0] - z[0]).map(([, ps]) => ps);
        const slotMatches = slots.map((ps) => items.map((it) => ps.some((p) => partMatches(p, it))));
        const seqs = findSequences(slotMatches, items.length, opts.slack);
        if (seqs.length === 0) continue;
        total += seqs.length;
        observed.set(Math.floor(vid / 1_000_000), (observed.get(Math.floor(vid / 1_000_000)) ?? 0) + seqs.length);
        // Sample text: the matched stretch (including any slack words).
        const [s, e] = seqs[0]!;
        const text = slots
          .slice(s, e + 1)
          .map((ps) => {
            const sorted = [...ps].sort((a, z) => a.part_num - z.part_num);
            return sorted[0]!.lang === 'G' ? sorted[0]!.surface : sorted.map((p) => p.surface).join('');
          })
          .join(' ');
        matches.push({ verse_id: vid, text });
      }

      if (total === 0) {
        fail(
          opts,
          `No verses match the formula '${opts.formula}'${opts.scope ? ` in ${opts.scope}` : ''} with slack ${opts.slack}. Try raising --slack to allow intervening words.`,
        );
      }

      // Expected concentration: each book's share of default-stream word
      // tokens in scope. Count word slots (distinct verse_id+word_num), not
      // morpheme rows — matching operates on slots, and morpheme counts would
      // overweight heavily-segmented Hebrew books.
      const tokensByBook = new Map<number, number>();
      for (const r of db
        .prepare(
          `SELECT CAST(verse_id/1000000 AS INT) b, COUNT(*) n FROM
             (SELECT DISTINCT verse_id, word_num FROM study.words WHERE is_default = 1 AND ${scopeSql})
           GROUP BY b`,
        )
        .all(...scopeArgs) as Array<{ b: number; n: number }>) {
        tokensByBook.set(r.b, r.n);
      }
      const dist = concentration(observed, tokensByBook, total);

      const truncated = matches.length > opts.limit;
      const shown = truncated ? matches.slice(0, opts.limit) : matches;
      emit(
        opts,
        {
          formula: items.map((it) => it.raw),
          scope: opts.scope ?? 'whole canon',
          slack: opts.slack,
          total_matches: total,
          matching_verses: matches.length,
          note: 'expected = book share of default-stream word tokens in scope × total matches; ratio = observed/expected',
          distribution: dist.map((d) => ({
            book: byBookNum.get(d.book_num)?.name ?? `book${d.book_num}`,
            observed: d.observed,
            expected: d.expected,
            ratio: d.ratio,
          })),
          truncated,
          ...(truncated ? { hint: 'More matches exist; raise --limit or narrow --scope.' } : {}),
          samples: shown.map((m) => ({ ref: formatVerseId(m.verse_id), verse_id: m.verse_id, text: m.text })),
        },
        () =>
          [
            `${total} match${total === 1 ? '' : 'es'} in ${matches.length} verse${matches.length === 1 ? '' : 's'} for ${items.map((it) => it.raw).join(' → ')}` +
              `${opts.scope ? ` (scope: ${opts.scope})` : ''}${opts.slack ? ` (slack ${opts.slack})` : ''}`,
            '',
            'concentration by book (observed vs expected token share):',
            table(dist.map((d) => [`  ${byBookNum.get(d.book_num)?.name ?? d.book_num}`, String(d.observed), `exp ${d.expected}`, `×${d.ratio}`])),
            '',
            table(shown.map((m) => [formatVerseId(m.verse_id), m.text])),
            ...(truncated ? ['… truncated (raise --limit or narrow --scope)'] : []),
          ].join('\n'),
      );
    });
}
