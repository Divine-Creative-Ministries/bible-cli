import type { Command } from 'commander';
import { byBookNum, formatVerseId } from '../canon.js';
import { lxxPath, openCore, openStudy } from '../db/index.js';
import * as fs from 'node:fs';
import { emit, fail, table } from '../output.js';
import { parseRef } from '../refparse/index.js';
import { DEFAULT_TRANSLATION, intOpt, resolveTranslations, versesFor, ftsTableFor } from './read.js';

const bookName = (n: number): string => byBookNum.get(n)?.name ?? `book${n}`;

interface StrongsDossier {
  strongs: string;
  lemma: string | null;
  translit: string | null;
  short_gloss: string | null;
  total: number;
  verses: number;
  by_testament: { OT: number; NT: number };
  top_books: Array<{ book: string; n: number }>;
  gloss_range: Array<{ gloss: string; n: number }>;
  collocates: Array<{ strongs: string; lemma: string | null; together: number }>;
  sample_refs: string[];
}

/**
 * bible survey — the discovery-first entry point of the study lane: one call
 * returning the corpus's own structure for a topic before any interpretation.
 */
export function registerSurveyCommand(program: Command): void {
  program
    .command('survey')
    .description(
      "Corpus dossier for a topic — run this FIRST in any study. Accepts a Strong's number, original-language lemma, English word, or passage. Example: bible survey chesed · bible survey 'Isaiah 53' · bible survey covenant",
    )
    .argument('<query>', "Strong's number (H2617/G26), lemma, English word, or reference")
    .option('-t, --translation <id>', `translation for English-word statistics (default ${DEFAULT_TRANSLATION})`)
    .option('-l, --limit <n>', 'items per section (default 8)', intOpt, 8)
    .option('--json', 'output JSON')
    .action((query: string, opts: { translation?: string; limit: number; json?: boolean }) => {
      const db = openStudy();
      const L = opts.limit;

      // ---- helpers -------------------------------------------------------
      const strongsDossier = (key: string): StrongsDossier => {
        // Always filter through strongs_num (indexed); suffix narrows further.
        const suffixed = /[A-Za-z]$/.test(key.slice(1));
        const num = parseInt(key.slice(1), 10);
        const f = suffixed
          ? { sql: 'strongs_num = ? AND strongs_suffix = ?', args: [num, key.slice(-1)] as unknown[] }
          : {
              sql: "strongs_num = ? AND lang " + (key.startsWith('H') ? "IN ('H','A')" : "= 'G'"),
              args: [num] as unknown[],
            };
        const head = db
          .prepare(
            `SELECT lemma, translit, short_gloss FROM study.lexicon_entries
             WHERE (strongs = ? OR strongs_num = CAST(substr(?,2,4) AS INT)) AND lexicon_id IN ('bdb','tbesg','dodson','affixes','tagged')
             ORDER BY CASE lexicon_id WHEN 'bdb' THEN 0 WHEN 'tbesg' THEN 0 ELSE 1 END LIMIT 1`,
          )
          .get(key, key) as { lemma: string | null; translit: string | null; short_gloss: string | null } | undefined;
        const usage = db
          .prepare(`SELECT COUNT(*) total, COUNT(DISTINCT verse_id) verses FROM study.words WHERE ${f.sql} AND is_default=1`)
          .get(...f.args) as { total: number; verses: number };
        const byTest = db
          .prepare(
            `SELECT CASE WHEN verse_id < 40000000 THEN 'OT' ELSE 'NT' END t, COUNT(*) n
             FROM study.words WHERE ${f.sql} AND is_default=1 GROUP BY t`,
          )
          .all(...f.args) as Array<{ t: 'OT' | 'NT'; n: number }>;
        const topBooks = db
          .prepare(
            `SELECT CAST(verse_id/1000000 AS INT) b, COUNT(*) n FROM study.words
             WHERE ${f.sql} AND is_default=1 GROUP BY b ORDER BY n DESC LIMIT ?`,
          )
          .all(...f.args, L) as Array<{ b: number; n: number }>;
        const glosses = db
          .prepare(
            `SELECT gloss, COUNT(*) n FROM study.words WHERE ${f.sql} AND is_default=1 AND gloss IS NOT NULL
             GROUP BY gloss ORDER BY n DESC LIMIT ?`,
          )
          .all(...f.args, L) as Array<{ gloss: string; n: number }>;
        // collocates: distinctive words sharing verses with this one.
        // Candidates come from an indexed verse join; the 'distinctive'
        // (corpus <= 500) filter runs afterwards on the few dozen candidates.
        const candidates = db
          .prepare(
            `WITH vs AS (SELECT DISTINCT verse_id FROM study.words WHERE ${f.sql} AND is_default=1)
             SELECT w.strongs, w.strongs_num, w.strongs_suffix, MAX(w.lemma) lemma, COUNT(DISTINCT w.verse_id) together
             FROM study.words w JOIN vs ON w.verse_id = vs.verse_id
             WHERE w.is_default=1 AND w.strongs IS NOT NULL AND w.strongs_num < 9000 AND w.strongs_num != ?
             GROUP BY w.strongs HAVING together >= 3
             ORDER BY together DESC LIMIT 60`,
          )
          .all(...f.args, num) as Array<{ strongs: string; strongs_num: number; strongs_suffix: string | null; lemma: string | null; together: number }>;
        const corpusCount = db.prepare(
          `SELECT COUNT(*) n FROM study.words WHERE strongs_num = ? AND (strongs_suffix = ? OR (? IS NULL AND strongs_suffix IS NULL)) AND is_default=1`,
        );
        const collocates: Array<{ strongs: string; lemma: string | null; together: number }> = [];
        for (const c of candidates) {
          if (collocates.length >= L) break;
          const n = (corpusCount.get(c.strongs_num, c.strongs_suffix, c.strongs_suffix) as { n: number }).n;
          if (n <= 500) collocates.push({ strongs: c.strongs, lemma: c.lemma, together: c.together });
        }
        const sampleRefs = (
          db
            .prepare(`SELECT DISTINCT verse_id FROM study.words WHERE ${f.sql} AND is_default=1 ORDER BY verse_id LIMIT ?`)
            .all(...f.args, L) as Array<{ verse_id: number }>
        ).map((r) => formatVerseId(r.verse_id));
        return {
          strongs: key,
          lemma: head?.lemma ?? null,
          translit: head?.translit ?? null,
          short_gloss: head?.short_gloss ?? null,
          total: usage.total,
          verses: usage.verses,
          by_testament: {
            OT: byTest.find((x) => x.t === 'OT')?.n ?? 0,
            NT: byTest.find((x) => x.t === 'NT')?.n ?? 0,
          },
          top_books: topBooks.map((r) => ({ book: bookName(r.b), n: r.n })),
          gloss_range: glosses,
          collocates,
          sample_refs: sampleRefs,
        };
      };

      const quotesFor = (start: number, end: number, isNT: boolean): Array<Record<string, unknown>> => {
        if (!fs.existsSync(lxxPath())) return [];
        try {
          const ldb = openStudy(); // core with study; attach lxx lazily via openLxx would re-open — query through core handle
          ldb.exec(`ATTACH DATABASE '${lxxPath().replace(/'/g, "''")}' AS lxx`);
        } catch {
          // already attached
        }
        try {
          const col = isNT ? 'nt_verse_id' : 'spine_ot_verse_id';
          return db
            .prepare(
              `SELECT nt_verse_id, spine_ot_verse_id, lxx_book_num, lxx_chapter, lxx_verse, tier, run_len, shared_rare
               FROM lxx.nt_quotations WHERE ${col} BETWEEN ? AND ? AND tier IN ('quotation','allusion')
               ORDER BY CASE tier WHEN 'quotation' THEN 0 ELSE 1 END, run_len DESC LIMIT ?`,
            )
            .all(start, end, L) as Array<Record<string, unknown>>;
        } catch {
          return [];
        }
      };

      // ---- dispatch on query shape --------------------------------------
      const stArg = query.trim().match(/^([HGhg])(\d{1,4})([A-Za-z]?)$/);
      let mode: 'strongs' | 'passage' | 'english' = 'english';
      let ref: ReturnType<typeof parseRef> | null = null;
      if (stArg) mode = 'strongs';
      else {
        try {
          ref = parseRef(query);
          mode = 'passage';
        } catch {
          mode = 'english';
        }
      }

      if (mode === 'strongs') {
        const key = `${stArg![1]!.toUpperCase()}${stArg![2]}${stArg![3] ?? ''}`.replace(
          /^([HG])(\d+)/,
          (_, l: string, d: string) => l + d.padStart(4, '0'),
        );
        const d = strongsDossier(key);
        if (d.total === 0) fail(opts, `No occurrences of ${key} in the tagged text.`);
        const xrefTop = d.sample_refs.length
          ? (openCore()
              .prepare(
                `SELECT from_verse_id, to_verse_start, votes FROM cross_refs WHERE from_verse_id = ? ORDER BY votes DESC LIMIT 5`,
              )
              .all(
                (db.prepare(`SELECT verse_id FROM study.words WHERE strongs_num = CAST(substr(?,2,4) AS INT) AND is_default=1 GROUP BY verse_id ORDER BY COUNT(*) DESC LIMIT 1`).get(key) as { verse_id: number } | undefined)?.verse_id ?? 0,
              ) as Array<{ from_verse_id: number; to_verse_start: number; votes: number }>)
          : [];
        emit(
          opts,
          {
            query,
            mode,
            dossier: d,
            top_verse_cross_refs: xrefTop.map((x) => ({ from: formatVerseId(x.from_verse_id), to: formatVerseId(x.to_verse_start), votes: x.votes })),
            next_steps: [
              `bible word ${key} — full lexicon entries`,
              `bible lemma ${key} --book <range> — occurrences in a scope`,
              `bible passage "<ref>" --context 3 — read the key passages`,
              `bible quotes "<ref>" — how the NT takes up a passage`,
            ],
          },
          () =>
            [
              `${d.strongs}  ${d.lemma ?? ''} ${d.translit ? `(${d.translit})` : ''} — ${d.short_gloss ?? ''}`,
              `occurrences: ${d.total} in ${d.verses} verses  |  OT ${d.by_testament.OT} / NT ${d.by_testament.NT}`,
              '',
              'distribution:',
              ...d.top_books.map((b) => `  ${b.book.padEnd(16)} ${String(b.n).padStart(5)}`),
              d.gloss_range.length ? `\ngloss range: ${d.gloss_range.map((g) => `${g.gloss.trim()} ×${g.n}`).join('; ')}` : '',
              d.collocates.length
                ? `\nco-occurring distinctive words:\n` + table(d.collocates.map((c) => [`  ${c.strongs}`, c.lemma ?? '', `${c.together} shared verses`]))
                : '',
              `\nfirst occurrences: ${d.sample_refs.slice(0, 5).join('; ')}`,
            ]
              .filter(Boolean)
              .join('\n'),
        );
        return;
      }

      if (mode === 'passage' && ref) {
        const core = openCore();
        const nVerses = (core.prepare('SELECT COUNT(*) n FROM verses WHERE verse_id BETWEEN ? AND ?').get(ref.start, ref.end) as { n: number }).n;
        const vocab = db
          .prepare(
            `WITH inpass AS (
               SELECT strongs, MAX(lemma) lemma, MAX(gloss) gloss, COUNT(*) n FROM study.words
               WHERE verse_id BETWEEN ? AND ? AND is_default=1 AND strongs IS NOT NULL AND strongs_num < 9000
               GROUP BY strongs)
             SELECT i.*, (SELECT COUNT(*) FROM study.words w WHERE w.strongs = i.strongs AND w.is_default=1) corpus
             FROM inpass i ORDER BY corpus ASC LIMIT ?`,
          )
          .all(ref.start, ref.end, L) as Array<{ strongs: string; lemma: string; gloss: string; n: number; corpus: number }>;
        const xrefs = core
          .prepare(
            `SELECT from_verse_id, to_verse_start, to_verse_end, votes FROM cross_refs
             WHERE from_verse_id BETWEEN ? AND ? ORDER BY votes DESC LIMIT ?`,
          )
          .all(ref.start, ref.end, L) as Array<{ from_verse_id: number; to_verse_start: number; to_verse_end: number; votes: number }>;
        const isNT = ref.start >= 40_000_000;
        const q = quotesFor(ref.start, ref.end, isNT);
        const names = db
          .prepare(
            `SELECT DISTINCT n.display_name, n.kind, n.description FROM study.names n
             JOIN study.name_strongs ns ON ns.name_id = n.name_id
             JOIN study.words w ON w.strongs = ns.strongs
             WHERE w.verse_id BETWEEN ? AND ? AND w.is_default = 1 LIMIT ?`,
          )
          .all(ref.start, ref.end, L) as Array<{ display_name: string; kind: string; description: string | null }>;

        emit(
          opts,
          {
            query,
            mode,
            passage: { ref: query, verses: nVerses },
            distinctive_vocabulary: vocab,
            top_cross_refs: xrefs.map((x) => ({ from: formatVerseId(x.from_verse_id), to: formatVerseId(x.to_verse_start), votes: x.votes })),
            quotation_links: q.map((r) => ({
              nt: formatVerseId(r.nt_verse_id as number),
              ot: r.spine_ot_verse_id ? formatVerseId(r.spine_ot_verse_id as number) : `${bookName(r.lxx_book_num as number)} ${r.lxx_chapter}:${r.lxx_verse} (LXX)`,
              tier: r.tier,
              strength: (r.run_len as number) > 0 ? `${r.run_len}w` : `echo:${r.shared_rare}`,
            })),
            named_entities: names,
            next_steps: [
              `bible passage "${query}" --context 5 — read in context`,
              `bible compare "<verse>" -t all — check divergence at key verses`,
              `bible word <strongs> — study the load-bearing words above`,
              `bible xref "<verse>" --text — follow the strongest connections`,
            ],
          },
          () =>
            [
              `${query} — ${nVerses} verses`,
              '',
              'distinctive vocabulary (rarest first):',
              table(vocab.map((v) => [`  ${v.strongs}`, v.lemma ?? '', (v.gloss ?? '').slice(0, 24), `here ${v.n}`, `corpus ${v.corpus}`])),
              xrefs.length ? `\ntop cross-references:\n` + table(xrefs.map((x) => [`  ${formatVerseId(x.from_verse_id)}`, '→', formatVerseId(x.to_verse_start), `${x.votes} votes`])) : '',
              q.length
                ? `\nquotation links:\n` +
                  table(q.map((r) => [`  ${formatVerseId(r.nt_verse_id as number)}`, '⇐', r.spine_ot_verse_id ? formatVerseId(r.spine_ot_verse_id as number) : 'LXX', String(r.tier)]))
                : '',
              names.length ? `\nnamed entities: ${names.map((n) => `${n.display_name} (${n.kind})`).join(', ')}` : '',
            ]
              .filter(Boolean)
              .join('\n'),
        );
        return;
      }

      // english word/topic — but first try lemma/transliteration resolution
      // ('chesed', 'agape'), which outranks incidental English hits like the
      // personal name Chesed in Gen 22:22.
      {
        const norm = query.normalize('NFD').replace(/[\u0591-\u05C7\u0300-\u036F]/g, '').replace(/ς/g, 'σ').toLowerCase().normalize('NFC');
        const translitNorm = norm.replace(/[^a-z]/g, '');
        const byLemma = db
          .prepare('SELECT DISTINCT strongs FROM study.words WHERE (lemma_norm = ? OR lemma = ?) AND strongs IS NOT NULL LIMIT 4')
          .all(norm, query) as Array<{ strongs: string }>;
        let keys = byLemma.map((r) => r.strongs);
        if (keys.length === 0 && translitNorm.length >= 3) {
          // normalize the lexicon side too — Greek translits carry macrons (agapē)
          const found = new Set<string>();
          for (const r of db
            .prepare(`SELECT strongs, translit FROM study.lexicon_entries WHERE lexicon_id IN ('bdb','tbesg') AND translit IS NOT NULL`)
            .iterate() as Iterable<{ strongs: string; translit: string }>) {
            if (found.size >= 4) break;
            const t = r.translit.normalize('NFD').replace(/[\u0300-\u036F]/g, '').toLowerCase().replace(/[^a-z]/g, '');
            if (t === translitNorm) found.add(r.strongs);
          }
          keys = [...found];
        }
        if (keys.length > 0) {
          const dossiers = keys.map((k) => strongsDossier(k)).filter((d) => d.total > 0).sort((a, z) => z.total - a.total);
          if (dossiers.length > 0) {
            emit(
              opts,
              {
                query,
                mode: 'lemma-or-translit',
                dossiers,
                next_steps: dossiers.map((d) => `bible word ${d.strongs} — full lexicon entries`),
              },
              () =>
                dossiers
                  .map(
                    (d) =>
                      [
                        `${d.strongs}  ${d.lemma ?? ''} ${d.translit ? `(${d.translit})` : ''} — ${d.short_gloss ?? ''}`,
                        `occurrences: ${d.total} in ${d.verses} verses  |  OT ${d.by_testament.OT} / NT ${d.by_testament.NT}`,
                        'distribution:',
                        ...d.top_books.map((b) => `  ${b.book.padEnd(16)} ${String(b.n).padStart(5)}`),
                        d.collocates.length
                          ? 'co-occurring distinctive words:\n' +
                            table(d.collocates.map((c) => [`  ${c.strongs}`, c.lemma ?? '', `${c.together} shared verses`]))
                          : '',
                      ]
                        .filter(Boolean)
                        .join('\n'),
                  )
                  .join('\n\n'),
            );
            return;
          }
        }
      }
      const core = openCore();
      const tr = resolveTranslations(opts, opts.translation)[0]!;
      const fts = ftsTableFor(tr);
      const ftsBare = fts.replace('user.', '');
      const qNorm = query.replace(/'/g, '’');
      let verseCount = 0;
      let dist: Array<{ b: number; n: number }> = [];
      try {
        verseCount = (core
          .prepare(`SELECT COUNT(DISTINCT verse_id) n FROM ${fts} WHERE ${ftsBare} MATCH ? AND translation_id = ?`)
          .get(`"${qNorm.replace(/"/g, '')}"`, tr) as { n: number }).n;
        dist = core
          .prepare(
            `SELECT CAST(verse_id/1000000 AS INT) b, COUNT(*) n FROM ${fts} WHERE ${ftsBare} MATCH ? AND translation_id = ? GROUP BY b ORDER BY n DESC LIMIT ?`,
          )
          .all(`"${qNorm.replace(/"/g, '')}"`, tr, L) as Array<{ b: number; n: number }>;
      } catch {
        // non-word query string; fall through with zero counts
      }
      // underlying original words (reuse word-command logic shape)
      let underlying: Array<{ strongs: string; lemma: string | null; n: number }> = [];
      try {
        underlying = db
          .prepare(
            `WITH hits AS (SELECT DISTINCT verse_id FROM ${fts} WHERE ${ftsBare} MATCH ? AND translation_id = ?)
             SELECT w.strongs, MAX(w.lemma) lemma, COUNT(DISTINCT w.verse_id) n FROM study.words w
             JOIN hits ON w.verse_id = hits.verse_id
             WHERE w.is_default = 1 AND w.strongs IS NOT NULL AND w.strongs_num < 9000
             GROUP BY w.strongs HAVING n >= 3 ORDER BY n DESC LIMIT 6`,
          )
          .all(`"${qNorm.replace(/"/g, '')}"`, tr) as Array<{ strongs: string; lemma: string | null; n: number }>;
      } catch {
        // FTS could not parse the query string
      }
      const strong = underlying.filter((u) => u.n >= Math.max(3, verseCount * 0.3)).slice(0, 3);
      const dossiers = strong.map((u) => strongsDossier(u.strongs));

      if (verseCount === 0 && dossiers.length === 0) {
        fail(opts, `'${query}' is not a Strong's number, a parseable reference, or a word found in ${tr}. Try a different form, or 'bible word ${query}' for lexicon lookup.`);
      }
      emit(
        opts,
        {
          query,
          mode,
          translation: tr,
          verses_containing: verseCount,
          distribution: dist.map((d) => ({ book: bookName(d.b), verses: d.n })),
          underlying_original_words: underlying,
          dossiers,
          next_steps: [
            `bible search "${query}" --book <range> — see the hits in a scope`,
            ...dossiers.map((d) => `bible survey ${d.strongs} — full dossier for ${d.lemma ?? d.strongs}`),
            `bible search "${query}" --stem --count — include inflected forms`,
          ],
        },
        () =>
          [
            `'${query}' in ${tr}: ${verseCount} verses`,
            dist.length ? 'top books:\n' + dist.map((d) => `  ${bookName(d.b).padEnd(16)} ${String(d.n).padStart(4)}`).join('\n') : '',
            underlying.length
              ? `\nunderlying original words:\n` + table(underlying.map((u) => [`  ${u.strongs}`, u.lemma ?? '', `${u.n} of the verses`]))
              : '',
            ...dossiers.map(
              (d) =>
                `\n— ${d.strongs} ${d.lemma ?? ''} (${d.translit ?? ''}) “${d.short_gloss ?? ''}”: ${d.total}× | OT ${d.by_testament.OT} / NT ${d.by_testament.NT} | top: ${d.top_books
                  .slice(0, 4)
                  .map((b) => `${b.book} ${b.n}`)
                  .join(', ')}`,
            ),
          ]
            .filter(Boolean)
            .join('\n'),
      );
    });
}
