import { Command, InvalidArgumentError } from 'commander';
import { byBookNum, formatVerseId, splitVerseId } from '../canon.js';
import { openLxx, openStudy } from '../db/index.js';
import { emit, fail, table } from '../output.js';
import { intOpt, refOrFail, resolveTranslations, versesFor } from './read.js';

const lxxRef = (b: number, c: number, v: number): string =>
  `${byBookNum.get(b)?.name ?? b} ${c}:${v} (LXX)`;

/** "Isaiah 37:1-38" / "2 Kings 18:17-20:6" for a verse-id range. */
const rangeRef = (start: number, end: number): string => {
  if (start === end) return formatVerseId(start);
  const s = splitVerseId(start);
  const e = splitVerseId(end);
  if (s.bookNum !== e.bookNum) return `${formatVerseId(start)}-${formatVerseId(end)}`;
  const endPart = s.chapter !== e.chapter ? `${e.chapter}:${e.verse}` : `${e.verse === 0 ? 'title' : e.verse}`;
  return `${formatVerseId(start)}-${endPart}`;
};

export function registerDiscoverCommands(program: Command): void {
  program
    .command('quotes')
    .description(
      'OT-in-NT parallels computed from the Greek (LXX vs NT), in confidence tiers: quotation (5+ word run), allusion (4-word run), echo (shared rare vocabulary). Example: bible quotes "Rev 1:7"',
    )
    .argument('<ref>', 'reference (NT or OT)')
    .option('--tier <t>', "minimum tier: 'quotation' | 'allusion' | 'echo' (default: allusion — echoes are speculative)", 'allusion')
    .option('--min-words <n>', 'minimum shared word run for run tiers (default 4)', (v) => { const n = intOpt(v); if (n < 4) throw new InvalidArgumentError('minimum is 4 — shorter runs are not indexed'); return n; }, 4)
    .option('--text', 'include the English text of the counterpart verses')
    .option('-t, --translation <id>', 'translation for --text')
    .option('-l, --limit <n>', 'max results (default 25)', intOpt, 25)
    .option('--json', 'output JSON')
    .action((refArg: string, opts: { tier: string; minWords: number; text?: boolean; translation?: string; limit: number; json?: boolean }) => {
      const ref = refOrFail(opts, refArg);
      const db = openLxx();
      const tr = opts.text ? resolveTranslations(opts, opts.translation)[0]! : null;
      const isNT = ref.start >= 40_000_000;
      const TIER_RANK: Record<string, number> = { quotation: 3, allusion: 2, echo: 1 };
      const minRank = TIER_RANK[opts.tier.toLowerCase()];
      if (!minRank) fail(opts, `Unknown tier '${opts.tier}'. Options: quotation, allusion, echo.`);
      const tiers = Object.entries(TIER_RANK).filter(([, r]) => r >= minRank).map(([t]) => t);

      interface Row {
        nt_verse_id: number;
        lxx_book_num: number;
        lxx_chapter: number;
        lxx_verse: number;
        spine_ot_verse_id: number | null;
        tier: string;
        match_level: string;
        run_len: number;
        shared_rare: number;
        shared_text: string;
      }
      const tierSql = tiers.map(() => '?').join(',');
      const rows = (
        isNT
          ? db.prepare(
              `SELECT * FROM lxx.nt_quotations WHERE nt_verse_id BETWEEN ? AND ? AND tier IN (${tierSql}) AND (run_len = 0 OR run_len >= ?)
               ORDER BY CASE tier WHEN 'quotation' THEN 0 WHEN 'allusion' THEN 1 ELSE 2 END, run_len DESC, shared_rare DESC LIMIT ?`,
            )
          : db.prepare(
              `SELECT * FROM lxx.nt_quotations WHERE spine_ot_verse_id BETWEEN ? AND ? AND tier IN (${tierSql}) AND (run_len = 0 OR run_len >= ?)
               ORDER BY CASE tier WHEN 'quotation' THEN 0 WHEN 'allusion' THEN 1 ELSE 2 END, run_len DESC, shared_rare DESC LIMIT ?`,
            )
      ).all(ref.start, ref.end, ...tiers, opts.minWords, opts.limit) as Row[];

      if (rows.length === 0) {
        fail(
          opts,
          `No parallels at tier '${opts.tier}'+ for '${refArg}'. ` +
            (minRank > 1 ? `Try --tier echo for shared-rare-vocabulary matches, ` : '') +
            `or 'bible xref' for thematic connections without shared wording.`,
        );
      }
      const textOf = (id: number | null): string | undefined =>
        opts.text && tr && id ? versesFor(tr, id, id).map((v) => v.text).join(' ') : undefined;
      const strength = (r: Row): string =>
        (r.run_len > 0 ? `${r.run_len}w` : `echo:${r.shared_rare}`) + (r.match_level === 'lemma' ? '≈' : '');

      emit(
        opts,
        {
          ref: refArg,
          direction: isNT ? 'nt-quoting-ot' : 'ot-quoted-in-nt',
          note: 'Computed parallels. quotation = 5+ shared-word run (verbatim); allusion = 4+ word/lemma run; echo = 3-lemma run or shared rare vocabulary (speculative). ≈ marks lemma-level matches (inflections differ). Verify by reading both contexts.',
          parallels: rows.map((r) => ({
            nt: formatVerseId(r.nt_verse_id),
            lxx: lxxRef(r.lxx_book_num, r.lxx_chapter, r.lxx_verse),
            ot_spine: r.spine_ot_verse_id ? formatVerseId(r.spine_ot_verse_id) : null,
            tier: r.tier,
            match_level: r.match_level,
            shared_words: r.run_len,
            shared_rare: r.shared_rare,
            shared_text: r.shared_text,
            ...(opts.text ? { nt_text: textOf(r.nt_verse_id), ot_text: textOf(r.spine_ot_verse_id) } : {}),
          })),
        },
        () =>
          table(
            rows.map((r) => [
              formatVerseId(r.nt_verse_id),
              '⇐',
              r.spine_ot_verse_id ? formatVerseId(r.spine_ot_verse_id) : lxxRef(r.lxx_book_num, r.lxx_chapter, r.lxx_verse),
              r.tier,
              strength(r),
              `“${r.shared_text.length > 55 ? r.shared_text.slice(0, 52) + '…' : r.shared_text}”`,
            ]),
          ) + (opts.text ? '\n\n' + rows.map((r) => `${formatVerseId(r.nt_verse_id)}: ${textOf(r.nt_verse_id) ?? ''}\n  ⇐ ${r.spine_ot_verse_id ? formatVerseId(r.spine_ot_verse_id) : lxxRef(r.lxx_book_num, r.lxx_chapter, r.lxx_verse)}: ${textOf(r.spine_ot_verse_id) ?? '(LXX only)'}`).join('\n\n') : ''),
      );
    });

  program
    .command('parallels')
    .description(
      'Inner-biblical parallels within a testament, computed from original-language lemma runs (Kings↔Chronicles, Psalm doublets, Synoptics, Jude↔2 Peter), in confidence tiers: parallel (5+ lemma run), allusion (4), echo (3 rare lemmas). Example: bible parallels "2 Kings 19:1"',
    )
    .argument('<ref>', 'reference (verse or range)')
    .option('--tier <t>', "minimum tier: 'parallel' | 'allusion' | 'echo' (default: allusion — echoes are speculative)", 'allusion')
    .option('--no-text', 'omit the counterpart passage text')
    .option('-t, --translation <id>', 'translation for counterpart text (default BSB)')
    .option('-l, --limit <n>', 'max results (default 15)', intOpt, 15)
    .option('--json', 'output JSON')
    .action((refArg: string, opts: { tier: string; text: boolean; translation?: string; limit: number; json?: boolean }) => {
      const ref = refOrFail(opts, refArg);
      const db = openStudy();
      // Graceful failure on a study database predating the parallels data release.
      if (!db.prepare("SELECT 1 FROM study.sqlite_master WHERE type='table' AND name='text_parallels'").get()) {
        fail(opts, `This study database predates computed parallels. Update it: delete bible-study.db from 'bible db path' and run 'bible db download'.`);
      }
      const tr = opts.text ? resolveTranslations(opts, opts.translation)[0]! : null;
      const TIER_RANK: Record<string, number> = { parallel: 3, allusion: 2, echo: 1 };
      const minRank = TIER_RANK[opts.tier.toLowerCase()];
      if (!minRank) fail(opts, `Unknown tier '${opts.tier}'. Options: parallel, allusion, echo.`);
      const tiers = Object.entries(TIER_RANK).filter(([, r]) => r >= minRank).map(([t]) => t);

      interface Row {
        corpus: string;
        a_start: number;
        a_end: number;
        b_start: number;
        b_end: number;
        tier: string;
        run_len: number;
        shared_lemmas: string;
        n_verses: number;
      }
      const tierSql = tiers.map(() => '?').join(',');
      const rows = db
        .prepare(
          `SELECT corpus, a_start, a_end, b_start, b_end, tier, run_len, shared_lemmas, n_verses
           FROM study.text_parallels
           WHERE ((a_end >= ? AND a_start <= ?) OR (b_end >= ? AND b_start <= ?)) AND tier IN (${tierSql})
           ORDER BY CASE tier WHEN 'parallel' THEN 0 WHEN 'allusion' THEN 1 ELSE 2 END,
                    run_len DESC, n_verses DESC
           LIMIT ?`,
        )
        .all(ref.start, ref.end, ref.start, ref.end, ...tiers, opts.limit) as Row[];

      if (rows.length === 0) {
        fail(
          opts,
          `No inner-biblical parallels at tier '${opts.tier}'+ for '${refArg}'. ` +
            (minRank > 1 ? `Try --tier echo for rare-vocabulary matches, ` : '') +
            `'bible quotes' for OT-in-NT links, or 'bible xref' for thematic connections.`,
        );
      }
      // Present the side that overlaps the query as 'self', the other as the parallel.
      const sided = rows.map((r) => {
        const aHit = r.a_end >= ref.start && r.a_start <= ref.end;
        const [selfStart, selfEnd, otherStart, otherEnd] = aHit
          ? [r.a_start, r.a_end, r.b_start, r.b_end]
          : [r.b_start, r.b_end, r.a_start, r.a_end];
        return { ...r, selfStart, selfEnd, otherStart, otherEnd };
      });
      const textOf = (start: number, end: number): string | undefined =>
        tr ? versesFor(tr, start, end).map((v) => v.text).join(' ') : undefined;

      emit(
        opts,
        {
          ref: refArg,
          note: 'Computed within-testament parallels from shared original-language lemma runs. parallel = 5+ lemma run (near-verbatim); allusion = 4-lemma run; echo = 3-lemma run of rare words (speculative). Ranges merge consecutive pairing verses. Verify by reading both contexts.',
          parallels: sided.map((r) => ({
            self: rangeRef(r.selfStart, r.selfEnd),
            parallel: rangeRef(r.otherStart, r.otherEnd),
            corpus: r.corpus,
            tier: r.tier,
            run_len: r.run_len,
            n_verses: r.n_verses,
            shared_lemmas: r.shared_lemmas,
            ...(opts.text ? { text: textOf(r.otherStart, r.otherEnd) } : {}),
          })),
        },
        () =>
          table(
            sided.map((r) => [
              rangeRef(r.selfStart, r.selfEnd),
              '⇔',
              rangeRef(r.otherStart, r.otherEnd),
              r.tier,
              `${r.run_len}w` + (r.n_verses > 1 ? `×${r.n_verses}v` : ''),
              `“${r.shared_lemmas.length > 45 ? r.shared_lemmas.slice(0, 42) + '…' : r.shared_lemmas}”`,
            ]),
          ) +
          (opts.text
            ? '\n\n' +
              sided
                .map((r) => {
                  const t = textOf(r.otherStart, r.otherEnd) ?? '';
                  return `${rangeRef(r.otherStart, r.otherEnd)}: ${t.length > 300 ? t.slice(0, 297) + '…' : t}`;
                })
                .join('\n\n')
            : ''),
      );
    });

  program
    .command('similar')
    .description(
      'Passages sharing distinctive vocabulary with a passage (idf-weighted lemma overlap; lexical, not semantic). Example: bible similar "Isa 53:3-7"',
    )
    .argument('<ref>', 'reference (verse or short passage)')
    .option('--cross-language', 'bridge Hebrew↔Greek via lexicon links (e.g. LXX-informed equivalents)')
    .option('-l, --limit <n>', 'max results (default 15)', intOpt, 15)
    .option('--json', 'output JSON')
    .action((refArg: string, opts: { crossLanguage?: boolean; limit: number; json?: boolean }) => {
      const ref = refOrFail(opts, refArg);
      const db = openStudy();

      // Distinctive lemmas of the passage: corpus frequency <= 400, weighted 1/ln(freq+1).
      const seed = db
        .prepare(
          `WITH inpass AS (
             SELECT strongs, COUNT(*) k FROM study.words
             WHERE verse_id BETWEEN ? AND ? AND is_default=1 AND strongs IS NOT NULL AND strongs_num < 9000
             GROUP BY strongs)
           SELECT i.strongs,
                  (SELECT COUNT(*) FROM study.words w WHERE w.strongs = i.strongs AND w.is_default=1) freq
           FROM inpass i`,
        )
        .all(ref.start, ref.end) as Array<{ strongs: string; freq: number }>;
      let terms = seed.filter((s) => s.freq > 0 && s.freq <= 400);
      if (terms.length === 0) fail(opts, `No distinctive vocabulary found in '${refArg}' (all words are very common).`);

      if (opts.crossLanguage) {
        const bridgedKeys = new Set<string>();
        const bridge = db.prepare(
          `SELECT target k FROM study.lexicon_links WHERE strongs = ? AND rel LIKE '%greek%'
           UNION SELECT strongs k FROM study.lexicon_links WHERE target = ? AND rel LIKE '%greek%'`,
        );
        for (const t of terms) {
          for (const b of bridge.all(t.strongs, t.strongs) as Array<{ k: string }>) {
            if (b.k && !terms.some((x) => x.strongs === b.k)) bridgedKeys.add(b.k);
          }
        }
        // Bridged terms get their own corpus frequency and must pass the same
        // distinctiveness cutoff — a rare Greek word may bridge to a very
        // common Hebrew one, which would poison the idf weighting.
        const freqOf = db.prepare('SELECT COUNT(*) n FROM study.words WHERE strongs = ? AND is_default = 1');
        for (const k of bridgedKeys) {
          const n = (freqOf.get(k) as { n: number }).n;
          if (n > 0 && n <= 400) terms.push({ strongs: k, freq: n });
        }
      }

      // Score candidate verses by summed idf of shared distinctive lemmas.
      const scores = new Map<number, { score: number; shared: Set<string> }>();
      const occ = db.prepare(
        `SELECT DISTINCT verse_id FROM study.words WHERE strongs = ? AND is_default = 1`,
      );
      for (const t of terms) {
        const w = 1 / Math.log(t.freq + 2);
        for (const row of occ.all(t.strongs) as Array<{ verse_id: number }>) {
          if (row.verse_id >= ref.start && row.verse_id <= ref.end) continue; // exclude self
          let sc = scores.get(row.verse_id);
          if (!sc) {
            sc = { score: 0, shared: new Set() };
            scores.set(row.verse_id, sc);
          }
          if (!sc.shared.has(t.strongs)) {
            sc.shared.add(t.strongs);
            sc.score += w;
          }
        }
      }
      const ranked = [...scores.entries()]
        .filter(([, v]) => v.shared.size >= 2)
        .sort((a, z) => z[1].score - a[1].score)
        .slice(0, opts.limit);
      if (ranked.length === 0) {
        fail(opts, `No passages share 2+ distinctive words with '${refArg}'. Try a longer passage or --cross-language.`);
      }

      const lemmaOf = db.prepare(`SELECT lemma, gloss FROM study.words WHERE strongs = ? AND lemma IS NOT NULL LIMIT 1`);
      emit(
        opts,
        {
          ref: refArg,
          method: 'idf-weighted shared distinctive vocabulary (lexical overlap, not semantic similarity)',
          results: ranked.map(([vid, v]) => ({
            ref: formatVerseId(vid),
            verse_id: vid,
            score: Math.round(v.score * 100) / 100,
            shared: [...v.shared].map((s) => {
              const l = lemmaOf.get(s) as { lemma: string; gloss: string } | undefined;
              return { strongs: s, lemma: l?.lemma, gloss: l?.gloss };
            }),
          })),
        },
        () =>
          table(
            ranked.map(([vid, v]) => [
              formatVerseId(vid),
              v.score.toFixed(2),
              [...v.shared]
                .map((s) => (lemmaOf.get(s) as { lemma: string } | undefined)?.lemma ?? s)
                .join(' '),
            ]),
          ),
      );
    });

  program
    .command('name')
    .description('Who/what is this? Individualised persons and places. Example: bible name Zechariah')
    .argument('<query>', 'a proper name (English)')
    .option('-l, --limit <n>', 'max individuals listed (default 12)', intOpt, 12)
    .option('--json', 'output JSON')
    .action((query: string, opts: { limit: number; json?: boolean }) => {
      const db = openStudy();
      const rows = db
        .prepare(
          `SELECT name_id, kind, unique_name, display_name, ustrong, description, summary
           FROM study.names WHERE display_name = ? COLLATE NOCASE
           OR display_name LIKE ? COLLATE NOCASE ORDER BY name_id LIMIT ?`,
        )
        .all(query, `${query}%`, opts.limit) as Array<{
          name_id: number;
          kind: string;
          unique_name: string;
          display_name: string;
          ustrong: string | null;
          description: string | null;
          summary: string | null;
        }>;
      if (rows.length === 0) {
        fail(opts, `No person or place named '${query}' found. Names follow ESV spelling (e.g. 'Zechariah', 'Beersheba').`);
      }
      const strongsOf = db.prepare('SELECT strongs FROM study.name_strongs WHERE name_id = ?');
      const usage = db.prepare(
        `SELECT COUNT(*) n, MIN(verse_id) first_v, MAX(verse_id) last_v FROM study.words WHERE strongs = ? AND is_default=1`,
      );
      const enriched = rows.map((r) => {
        const strongs = (strongsOf.all(r.name_id) as Array<{ strongs: string }>).map((x) => x.strongs);
        let total = 0;
        let firstV: number | null = null;
        let lastV: number | null = null;
        for (const s of strongs) {
          const u = usage.get(s) as { n: number; first_v: number | null; last_v: number | null };
          total += u.n;
          if (u.first_v && (!firstV || u.first_v < firstV)) firstV = u.first_v;
          if (u.last_v && (!lastV || u.last_v > lastV)) lastV = u.last_v;
        }
        return { ...r, strongs, occurrences: total, first: firstV ? formatVerseId(firstV) : null, last: lastV ? formatVerseId(lastV) : null };
      });
      emit(opts, { query, count: enriched.length, individuals: enriched }, () =>
        enriched
          .map(
            (e) =>
              `${e.display_name} (${e.kind}) — ${e.description ?? e.summary ?? ''}\n` +
              `  id: ${e.unique_name}  strongs: ${(e.strongs as string[]).join(', ')}\n` +
              `  ${e.occurrences} occurrences` +
              (e.first ? `, ${e.first} → ${e.last}` : '') +
              (e.summary && e.description ? `\n  ${e.summary}` : ''),
          )
          .join('\n\n'),
      );
    });
}
