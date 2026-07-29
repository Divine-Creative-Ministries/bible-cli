import type { Command } from 'commander';
import { byBookNum, formatVerseId } from '../canon.js';
import { openStudy } from '../db/index.js';
import { emit, fail, table } from '../output.js';
import { parseScope, RefError } from '../refparse/index.js';
import { refOrFail } from './read.js';

export const EDITION_BITS: Record<string, number> = {
  na27: 1, na28: 2, sbl: 4, tr: 8, byz: 16, wh: 32, treg: 64, tyn: 128,
};

interface WordRow {
  verse_id: number;
  word_num: number;
  part_num: number;
  lang: string;
  surface: string;
  translit: string | null;
  lemma: string | null;
  strongs: string | null;
  gloss: string | null;
  morph_raw: string | null;
  pos: string | null;
  person: string | null;
  gender: string | null;
  number_: string | null;
  gcase: string | null;
  tense: string | null;
  voice: string | null;
  mood: string | null;
  stem: string | null;
  state: string | null;
  degree: string | null;
  text_type: string | null;
  editions: number;
  is_default: number;
}

const WORD_COLS = `verse_id, word_num, part_num, lang, surface, translit, lemma, strongs, gloss,
  morph_raw, pos, person, gender, number_, gcase, tense, voice, mood, stem, state, degree,
  text_type, editions, is_default`;

function morphSummary(w: WordRow): string {
  const bits = [
    w.pos,
    w.stem,
    w.tense,
    w.voice,
    w.mood,
    w.person ? `${w.person}p` : null,
    w.gender?.[0],
    w.number_?.[0],
    w.gcase,
    w.state,
  ].filter(Boolean);
  return bits.join(' ');
}

/** Strongs argument: 'H2617', 'G26', 'g0026', optionally with dStrong suffix 'H2617a'. */
function parseStrongsArg(s: string): { num: number; lang: 'H' | 'G'; suffix?: string } | undefined {
  const m = s.trim().match(/^([HGhg])(\d{1,4})([A-Za-z]?)$/);
  if (!m) return undefined;
  return {
    lang: m[1]!.toUpperCase() as 'H' | 'G',
    num: parseInt(m[2]!, 10),
    ...(m[3] ? { suffix: m[3] } : {}),
  };
}

function scopeFilter(opts: { json?: boolean }, book: string | undefined): { sql: string; args: number[] } {
  if (!book) return { sql: '', args: [] };
  try {
    const scope = parseScope(book);
    return {
      sql: ' AND (' + scope.map(() => 'w.verse_id BETWEEN ? AND ?').join(' OR ') + ')',
      args: scope.flatMap((s) => [s.start, s.end]),
    };
  } catch (e) {
    if (e instanceof RefError) fail(opts, e.message);
    throw e;
  }
}

export function registerOriginalCommands(program: Command): void {
  program
    .command('interlinear')
    .description('Word-by-word original language with English. Example: bible interlinear "John 3:16"')
    .argument('<ref>', 'reference (verse or short range)')
    .option('--source <s>', "'bsb' (Berean alignment, default) or 'step' (TAHOT/TAGNT with dStrongs)", 'bsb')
    .option('--json', 'output JSON')
    .action((refArg: string, opts: { source: string; json?: boolean }) => {
      const ref = refOrFail(opts, refArg);
      if (ref.end - ref.start > 30) fail(opts, 'interlinear is per-verse; give a verse or a range of up to ~30 verses.');
      const db = openStudy();
      if (opts.source === 'bsb') {
        const rows = db
          .prepare(
            `SELECT verse_id, orig_sort, lang, surface, translit, strongs, parsing, gloss, heading
             FROM study.bsb_interlinear WHERE verse_id BETWEEN ? AND ? ORDER BY verse_id, orig_sort`,
          )
          .all(ref.start, ref.end) as Array<Record<string, unknown>>;
        if (rows.length === 0) fail(opts, `No interlinear data for '${refArg}'.`);
        emit(opts, { source: 'bsb', words: rows.map((r) => ({ ...r, ref: formatVerseId(r.verse_id as number) })) }, () => {
          const byVerse = new Map<number, typeof rows>();
          for (const r of rows) {
            const k = r.verse_id as number;
            if (!byVerse.has(k)) byVerse.set(k, []);
            byVerse.get(k)!.push(r);
          }
          return [...byVerse.entries()]
            .map(
              ([vid, ws]) =>
                `${formatVerseId(vid)}\n` +
                table(ws.map((w) => [String(w.surface), String(w.translit ?? ''), String(w.strongs ?? ''), String(w.parsing ?? ''), String(w.gloss)])),
            )
            .join('\n\n');
        });
      } else {
        const rows = db
          .prepare(`SELECT ${WORD_COLS} FROM study.words w WHERE w.verse_id BETWEEN ? AND ? AND is_default=1 ORDER BY verse_id, word_num, part_num`)
          .all(ref.start, ref.end) as WordRow[];
        if (rows.length === 0) fail(opts, `No tagged original-language data for '${refArg}'.`);
        emit(
          opts,
          { source: 'step', words: rows.map((w) => ({ ...w, ref: formatVerseId(w.verse_id), morph_summary: morphSummary(w) })) },
          () => {
            const byVerse = new Map<number, WordRow[]>();
            for (const r of rows) {
              if (!byVerse.has(r.verse_id)) byVerse.set(r.verse_id, []);
              byVerse.get(r.verse_id)!.push(r);
            }
            return [...byVerse.entries()]
              .map(
                ([vid, ws]) =>
                  `${formatVerseId(vid)}\n` +
                  table(ws.map((w) => [w.surface, w.translit ?? '', w.strongs ?? '', w.morph_raw ?? '', w.gloss ?? '', morphSummary(w)])),
              )
              .join('\n\n');
          },
        );
      }
    });

  program
    .command('original')
    .description('Original-language text of a passage. Example: bible original "Rom 8:1" --edition byz')
    .argument('<ref>', 'reference')
    .option('--edition <e>', "Greek edition: na27|na28|sbl|tr|byz|wh|treg|tyn (default: modern critical stream)")
    .option('--variants', 'include non-default variant words with their edition flags')
    .option('--json', 'output JSON')
    .action((refArg: string, opts: { edition?: string; variants?: boolean; json?: boolean }) => {
      const ref = refOrFail(opts, refArg);
      const db = openStudy();
      let rows: WordRow[];
      if (opts.edition) {
        const bit = EDITION_BITS[opts.edition.toLowerCase()];
        if (!bit) fail(opts, `Unknown edition '${opts.edition}'. Options: ${Object.keys(EDITION_BITS).join(', ')}.`);
        rows = db
          .prepare(
            `SELECT ${WORD_COLS} FROM study.words w
             WHERE w.verse_id BETWEEN ? AND ? AND (editions & ? != 0 OR lang IN ('H','A'))
             ORDER BY verse_id, word_num, part_num`,
          )
          .all(ref.start, ref.end, bit) as WordRow[];
      } else {
        rows = db
          .prepare(
            `SELECT ${WORD_COLS} FROM study.words w
             WHERE w.verse_id BETWEEN ? AND ? AND ${opts.variants ? '1=1' : 'is_default=1'}
             ORDER BY verse_id, word_num, part_num`,
          )
          .all(ref.start, ref.end) as WordRow[];
      }
      if (rows.length === 0) fail(opts, `No original-language text for '${refArg}'.`);
      const editionNames = (mask: number): string[] =>
        Object.entries(EDITION_BITS).filter(([, b]) => mask & b).map(([n]) => n);
      emit(
        opts,
        {
          edition: opts.edition ?? 'default',
          verses: groupText(rows).map((v) => ({
            ref: formatVerseId(v.verseId),
            verse_id: v.verseId,
            text: v.text,
            ...(opts.variants
              ? {
                  variants: rows
                    .filter((r) => r.verse_id === v.verseId && !r.is_default)
                    .map((r) => ({ surface: r.surface, editions: editionNames(r.editions), type: r.text_type })),
                }
              : {}),
          })),
        },
        () => groupText(rows).map((v) => `${formatVerseId(v.verseId)}  ${v.text}`).join('\n'),
      );

      function groupText(ws: WordRow[]): Array<{ verseId: number; text: string }> {
        const seen = new Map<number, string[]>();
        for (const w of ws) {
          if (!opts.edition && !opts.variants && !w.is_default) continue;
          if (!seen.has(w.verse_id)) seen.set(w.verse_id, []);
          if (w.part_num === 1) seen.get(w.verse_id)!.push(w.surface);
        }
        return [...seen.entries()].map(([verseId, words]) => ({ verseId, text: words.join(' ') }));
      }
    });

  program
    .command('lemma')
    .description('Occurrences of a lemma or Strong\'s number. Examples: bible lemma H2617 --book Psalms · bible lemma ἀγάπη · bible lemma G0026 --count')
    .argument('<query>', "Strong's number (H2617, G26, H2617a) or an original-language lemma (חֶסֶד, ἀγάπη)")
    .option('-b, --book <scope>', "limit scope: book, range, 'ot', 'nt'")
    .option('--count', 'only counts')
    .option('-l, --limit <n>', 'max occurrences listed (default 50)', (v) => parseInt(v, 10), 50)
    .option('--json', 'output JSON')
    .action((query: string, opts: { book?: string; count?: boolean; limit: number; json?: boolean }) => {
      const db = openStudy();
      const scope = scopeFilter(opts, opts.book);
      const st = parseStrongsArg(query);
      let where: string;
      let args: unknown[];
      if (st) {
        where = `w.strongs_num = ? AND w.lang ${st.lang === 'H' ? "IN ('H','A')" : "= 'G'"}` + (st.suffix ? ' AND w.strongs_suffix = ?' : '');
        args = st.suffix ? [st.num, st.suffix] : [st.num];
      } else {
        // lemma text: normalize the same way the pipeline did
        const norm = query.normalize('NFD').replace(/[֑-ׇ̀-ͯ᪰-᫿]/g, '').replace(/ς/g, 'σ').toLowerCase().normalize('NFC');
        where = '(w.lemma_norm = ? OR w.lemma = ?)';
        args = [norm, query];
      }
      where += ' AND w.is_default = 1';

      const total = (db.prepare(`SELECT COUNT(*) n FROM study.words w WHERE ${where}${scope.sql}`).get(...args, ...scope.args) as { n: number }).n;
      if (total === 0) {
        fail(opts, `No occurrences of '${query}'. Check the Strong's number or lemma spelling (use 'bible word ${query}' for lexicon lookup).`);
      }
      const distinct = db
        .prepare(
          `SELECT w.strongs, w.lemma, COUNT(*) n FROM study.words w WHERE ${where}${scope.sql} GROUP BY w.strongs, w.lemma ORDER BY n DESC`,
        )
        .all(...args, ...scope.args) as Array<{ strongs: string; lemma: string; n: number }>;

      if (opts.count) {
        emit(opts, { query, total, forms: distinct }, () =>
          [`${total} occurrences`, ...distinct.map((d) => `  ${d.strongs ?? ''} ${d.lemma ?? ''}  ${d.n}`)].join('\n'),
        );
        return;
      }
      const rows = db
        .prepare(
          `SELECT ${WORD_COLS} FROM study.words w WHERE ${where}${scope.sql} ORDER BY verse_id, word_num LIMIT ?`,
        )
        .all(...args, ...scope.args, opts.limit + 1) as WordRow[];
      const truncated = rows.length > opts.limit;
      const shown = truncated ? rows.slice(0, opts.limit) : rows;
      emit(
        opts,
        {
          query,
          total,
          forms: distinct,
          truncated,
          hint: truncated ? 'More occurrences exist; use --limit, --count, or --book to narrow.' : undefined,
          occurrences: shown.map((w) => ({
            ref: formatVerseId(w.verse_id),
            verse_id: w.verse_id,
            surface: w.surface,
            strongs: w.strongs,
            gloss: w.gloss,
            morph: w.morph_raw,
          })),
        },
        () =>
          `${total} occurrences of ${query}` +
          (distinct.length > 1 ? ` (${distinct.map((d) => `${d.strongs}×${d.n}`).join(', ')})` : '') +
          '\n' +
          table(shown.map((w) => [formatVerseId(w.verse_id), w.surface, w.gloss ?? '', w.morph_raw ?? ''])) +
          (truncated ? '\n… truncated (raise --limit or add --book/--count)' : ''),
      );
    });

  program
    .command('word')
    .description("Word study: lexicon entries + usage stats. Examples: bible word H2617 · bible word agape · bible word 'lovingkindness'")
    .argument('<query>', "Strong's number, original-language lemma, or English word (reverse lookup)")
    .option('--json', 'output JSON')
    .action((query: string, opts: { json?: boolean }) => {
      const db = openStudy();
      const st = parseStrongsArg(query);
      let strongsKeys: string[] = [];

      if (st) {
        const rows = db
          .prepare('SELECT DISTINCT strongs FROM study.lexicon_entries WHERE strongs_num = ? AND lexicon_id IN (?,?)')
          .all(st.num, st.lang === 'H' ? 'tbesh' : 'tbesg', st.lang === 'H' ? 'tbesh' : 'tbesg') as Array<{ strongs: string }>;
        strongsKeys = rows.map((r) => r.strongs).filter((s) => s.startsWith(st.lang));
        if (st.suffix) {
          const exact = `${st.lang}${String(st.num).padStart(4, '0')}${st.suffix}`;
          if (strongsKeys.includes(exact)) strongsKeys = [exact];
        }
      } else {
        // try original-language lemma first, then English reverse lookup
        const norm = query.normalize('NFD').replace(/[֑-ׇ̀-ͯ]/g, '').replace(/ς/g, 'σ').toLowerCase().normalize('NFC');
        const byLemma = db
          .prepare('SELECT DISTINCT strongs FROM study.words WHERE (lemma_norm = ? OR lemma = ?) AND strongs IS NOT NULL LIMIT 8')
          .all(norm, query) as Array<{ strongs: string }>;
        if (byLemma.length > 0) {
          strongsKeys = byLemma.map((r) => r.strongs);
        } else {
          const hits = db
            .prepare(
              `SELECT strongs, lexicon_id, short_gloss FROM study.lexicon_fts WHERE lexicon_fts MATCH ? AND lexicon_id IN ('tbesh','tbesg') LIMIT 12`,
            )
            .all(`"${query.replace(/"/g, '')}"`) as Array<{ strongs: string; lexicon_id: string; short_gloss: string }>;
          strongsKeys = [...new Set(hits.map((h) => h.strongs))];
        }
        if (strongsKeys.length === 0) {
          // Transliteration lookup: 'agape' -> ἀγάπη via lexicon translit column
          const translitNorm = query.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
          const byTranslit = db
            .prepare(
              `SELECT DISTINCT strongs FROM study.lexicon_entries
               WHERE lexicon_id IN ('tbesh','tbesg') AND translit IS NOT NULL AND lower(translit) IN (?, ?) LIMIT 8`,
            )
            .all(translitNorm, query.toLowerCase()) as Array<{ strongs: string }>;
          strongsKeys = byTranslit.map((r) => r.strongs);
          if (strongsKeys.length === 0) {
            const loose = db
              .prepare(`SELECT strongs, translit FROM study.lexicon_entries WHERE lexicon_id IN ('tbesh','tbesg') AND translit IS NOT NULL`)
              .all() as Array<{ strongs: string; translit: string }>;
            const wanted = new Set<string>();
            for (const r of loose) {
              const t = r.translit.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
              if (t === translitNorm.replace(/[^a-z]/g, '')) wanted.add(r.strongs);
            }
            strongsKeys = [...wanted].slice(0, 8);
          }
        }
        if (strongsKeys.length === 0) {
          // Translation-specific vocabulary ('lovingkindness'): find verses
          // containing the English word, count which original words underlie
          // them — the dominant Strong's numbers are the answer.
          const underlying = db
            .prepare(
              `SELECT w.strongs, COUNT(*) n FROM study.words w
               WHERE w.is_default = 1 AND w.strongs IS NOT NULL AND w.strongs_num < 9000
                 AND w.verse_id IN (SELECT DISTINCT verse_id FROM verse_fts WHERE verse_fts MATCH ?)
               GROUP BY w.strongs HAVING n >= 3 ORDER BY n DESC LIMIT 6`,
            )
            .all(`"${query.replace(/"/g, '')}"`) as Array<{ strongs: string; n: number }>;
          // Keep only words that appear in a large share of the matching verses.
          const nVerses = (db.prepare('SELECT COUNT(DISTINCT verse_id) n FROM verse_fts WHERE verse_fts MATCH ?').get(`"${query.replace(/"/g, '')}"`) as { n: number }).n;
          strongsKeys = underlying.filter((u) => u.n >= Math.max(3, nVerses * 0.5)).map((u) => u.strongs);
        }
      }

      if (strongsKeys.length === 0) fail(opts, `Nothing found for '${query}'. Try a Strong's number (H2617/G0026), a Greek/Hebrew lemma, or an English gloss word.`);

      const entries = strongsKeys.map((key) => {
        const lex = db
          .prepare('SELECT lexicon_id, strongs, lemma, translit, pos, short_gloss, definition FROM study.lexicon_entries WHERE strongs = ? ORDER BY lexicon_id')
          .all(key) as Array<Record<string, string>>;
        const usage = db
          .prepare(
            `SELECT COUNT(*) total, COUNT(DISTINCT verse_id) verses FROM study.words WHERE strongs = ? AND is_default = 1`,
          )
          .get(key) as { total: number; verses: number };
        const topBooks = db
          .prepare(
            `SELECT CAST(verse_id/1000000 AS INT) book_num, COUNT(*) n FROM study.words
             WHERE strongs = ? AND is_default = 1 GROUP BY 1 ORDER BY n DESC LIMIT 5`,
          )
          .all(key) as Array<{ book_num: number; n: number }>;
        const links = db
          .prepare('SELECT rel, target FROM study.lexicon_links WHERE strongs = ?')
          .all(key) as Array<{ rel: string; target: string }>;
        const glossRange = db
          .prepare(
            `SELECT gloss, COUNT(*) n FROM study.words WHERE strongs = ? AND is_default = 1 AND gloss IS NOT NULL
             GROUP BY gloss ORDER BY n DESC LIMIT 8`,
          )
          .all(key) as Array<{ gloss: string; n: number }>;
        return { strongs: key, lexicon_entries: lex, usage, top_books: topBooks, gloss_range: glossRange, links };
      });

      emit(opts, { query, results: entries }, () =>
        entries
          .map((e) => {
            const head = e.lexicon_entries[0];
            const lines = [
              `${e.strongs}  ${head?.lemma ?? ''} ${head?.translit ? `(${head.translit})` : ''}  — ${head?.short_gloss ?? ''}`,
              `  occurrences: ${e.usage.total} in ${e.usage.verses} verses` +
                (e.top_books.length ? `  | top books: ${e.top_books.map((t) => `${byBookNum.get(t.book_num)?.name ?? t.book_num} (${t.n})`).join(', ')}` : ''),
              e.gloss_range.length > 1
                ? `  gloss range: ${e.gloss_range.map((g) => `${g.gloss.trim()} ×${g.n}`).join('; ')}`
                : '',
              ...e.lexicon_entries.map((le) => `  [${le.lexicon_id}] ${le.definition?.split('\n').join('\n    ') ?? le.short_gloss ?? ''}`),
              e.links.length ? `  related: ${e.links.map((l) => `${l.rel} ${l.target}`).join('; ')}` : '',
            ].filter(Boolean);
            return lines.join('\n');
          })
          .join('\n\n'),
      );
    });

  program
    .command('morph')
    .description('Full parse of every word in a verse. Example: bible morph "Gen 1:1"')
    .argument('<ref>', 'reference (single verse or short range)')
    .option('--json', 'output JSON')
    .action((refArg: string, opts: { json?: boolean }) => {
      const ref = refOrFail(opts, refArg);
      if (ref.end - ref.start > 10) fail(opts, 'morph is detailed; give a verse or a range of up to ~10 verses.');
      const db = openStudy();
      const rows = db
        .prepare(`SELECT ${WORD_COLS} FROM study.words w WHERE verse_id BETWEEN ? AND ? AND is_default=1 ORDER BY verse_id, word_num, part_num`)
        .all(ref.start, ref.end) as WordRow[];
      if (rows.length === 0) fail(opts, `No morphology data for '${refArg}'.`);
      emit(
        opts,
        {
          words: rows.map((w) => ({
            ref: formatVerseId(w.verse_id),
            surface: w.surface,
            lemma: w.lemma,
            strongs: w.strongs,
            gloss: w.gloss,
            morph_raw: w.morph_raw,
            parse: {
              pos: w.pos, person: w.person, gender: w.gender, number: w.number_, case: w.gcase,
              tense: w.tense, voice: w.voice, mood: w.mood, stem: w.stem, state: w.state, degree: w.degree,
            },
          })),
        },
        () =>
          table(
            rows.map((w) => [
              formatVerseId(w.verse_id),
              w.surface,
              w.lemma ?? '',
              w.strongs ?? '',
              w.morph_raw ?? '',
              morphSummary(w),
              w.gloss ?? '',
            ]),
          ),
      );
    });

  program
    .command('grep-morph')
    .description('Search by grammatical form. Example: bible grep-morph --stem niphal --tense participle --book Isaiah')
    .option('--lang <l>', 'H (Hebrew), A (Aramaic), G (Greek)')
    .option('--pos <p>', 'verb, noun, adjective, pronoun, article, preposition, conjunction, particle, suffix, adverb')
    .option('--stem <s>', 'Hebrew binyan: qal, niphal, piel, pual, hiphil, hophal, hithpael, …')
    .option('--tense <t>', 'Greek: aorist, present, perfect…; Hebrew: perfect, imperfect, wayyiqtol, participle, …')
    .option('--voice <v>', 'Greek: active, middle, passive, middle-passive')
    .option('--mood <m>', 'Greek: indicative, subjunctive, optative, imperative, infinitive, participle')
    .option('--person <p>', '1, 2, 3')
    .option('--gender <g>', 'masculine, feminine, neuter, common')
    .option('--number <n>', 'singular, plural, dual')
    .option('--case <c>', 'Greek: nominative, genitive, dative, accusative, vocative')
    .option('--state <s>', 'Hebrew: absolute, construct, determined')
    .option('--morph <glob>', "raw morphology code GLOB, e.g. 'V-2A*' or 'HVqw*'")
    .option('-b, --book <scope>', "book / range / 'ot' / 'nt'")
    .option('--count', 'only counts (by lemma)')
    .option('-l, --limit <n>', 'max listed (default 50)', (v) => parseInt(v, 10), 50)
    .option('--json', 'output JSON')
    .action((opts: Record<string, string> & { count?: boolean; limit: number; json?: boolean }) => {
      const db = openStudy();
      const conds: string[] = ['w.is_default = 1'];
      const args: unknown[] = [];
      const map: Array<[string, string]> = [
        ['lang', 'w.lang'], ['pos', 'w.pos'], ['stem', 'w.stem'], ['tense', 'w.tense'],
        ['voice', 'w.voice'], ['mood', 'w.mood'], ['person', 'w.person'], ['gender', 'w.gender'],
        ['number', 'w.number_'], ['case', 'w.gcase'], ['state', 'w.state'],
      ];
      for (const [opt, col] of map) {
        const v = opts[opt];
        if (v) {
          conds.push(`${col} = ?`);
          args.push(opt === 'lang' ? v.toUpperCase() : v.toLowerCase());
        }
      }
      if (opts.morph) {
        conds.push('w.morph_raw GLOB ?');
        args.push(opts.morph);
      }
      if (conds.length === 1 && !opts.book) {
        fail(opts, 'Give at least one filter (e.g. --stem niphal --tense participle) — see --help for options.');
      }
      const scope = scopeFilter(opts, opts.book);
      const where = conds.join(' AND ') + scope.sql;
      const total = (db.prepare(`SELECT COUNT(*) n FROM study.words w WHERE ${where}`).get(...args, ...scope.args) as { n: number }).n;

      if (opts.count) {
        const byLemma = db
          .prepare(
            `SELECT w.strongs, w.lemma, COUNT(*) n FROM study.words w WHERE ${where} GROUP BY w.strongs ORDER BY n DESC LIMIT 40`,
          )
          .all(...args, ...scope.args) as Array<{ strongs: string; lemma: string; n: number }>;
        emit(opts, { total, by_lemma: byLemma }, () =>
          [`${total} matching words`, ...byLemma.map((r) => `  ${r.strongs ?? '?'} ${r.lemma ?? ''}  ${r.n}`)].join('\n'),
        );
        return;
      }
      const rows = db
        .prepare(`SELECT ${WORD_COLS} FROM study.words w WHERE ${where} ORDER BY verse_id, word_num LIMIT ?`)
        .all(...args, ...scope.args, opts.limit + 1) as WordRow[];
      if (rows.length === 0) fail(opts, 'No words match those filters. Loosen a filter or check values via bible morph-codes.');
      const truncated = rows.length > opts.limit;
      const shown = truncated ? rows.slice(0, opts.limit) : rows;
      emit(
        opts,
        {
          total,
          truncated,
          hint: truncated ? 'More matches; use --count for aggregate or narrow with --book.' : undefined,
          matches: shown.map((w) => ({
            ref: formatVerseId(w.verse_id),
            surface: w.surface,
            lemma: w.lemma,
            strongs: w.strongs,
            morph: w.morph_raw,
            gloss: w.gloss,
          })),
        },
        () =>
          `${total} matches\n` +
          table(shown.map((w) => [formatVerseId(w.verse_id), w.surface, w.strongs ?? '', w.morph_raw ?? '', w.gloss ?? ''])) +
          (truncated ? '\n… truncated' : ''),
      );
    });
}
