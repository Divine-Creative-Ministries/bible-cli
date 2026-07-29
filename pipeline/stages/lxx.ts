import type { Database } from 'better-sqlite3';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { makeVerseId } from '../../src/canon.js';
import { RAW, log, normalizeGreek } from '../lib.js';

/**
 * Septuagint (Swete) ingestion + OT-in-NT quotation detection.
 *
 * Swete data files are word-per-line: 'book.chapter.verse WORD'. We keep the
 * books that counterpart the 39-book Protestant OT (Daniel from Theodotion,
 * which the NT normally follows). Ecclesiastes is absent from this
 * digitization.
 */
const FILES: Array<{ file: string; bookNum: number }> = [
  { file: '01.Genesis.txt', bookNum: 1 },
  { file: '02.Exodus.txt', bookNum: 2 },
  { file: '03.Leviticus.txt', bookNum: 3 },
  { file: '04.Numeri.txt', bookNum: 4 },
  { file: '05.Deuteronomium.txt', bookNum: 5 },
  { file: '06.Josue.txt', bookNum: 6 },
  { file: '08.Judices.txt', bookNum: 7 },
  { file: '10.Ruth.txt', bookNum: 8 },
  { file: '11.Regnorum_I.txt', bookNum: 9 },
  { file: '12.Regnorum_II.txt', bookNum: 10 },
  { file: '13.Regnorum_III.txt', bookNum: 11 },
  { file: '14.Regnorum_IV.txt', bookNum: 12 },
  { file: '15.Paralipomenon_I.txt', bookNum: 13 },
  { file: '16.Paralipomenon_II.txt', bookNum: 14 },
  { file: '18.Esdras_B.txt', bookNum: 15 }, // chapters 1-10 Ezra; 11-23 Nehemiah
  { file: '19.Esther.txt', bookNum: 17 },
  { file: '32.Job.txt', bookNum: 18 },
  { file: '27.Psalmi.txt', bookNum: 19 },
  { file: '29.Proverbia.txt', bookNum: 20 },
  { file: '31.Canticum.txt', bookNum: 22 },
  { file: '48.Isaias.txt', bookNum: 23 },
  { file: '49.Jeremias.txt', bookNum: 24 },
  { file: '51.Threni_seu_Lamentationes.txt', bookNum: 25 },
  { file: '53.Ezechiel.txt', bookNum: 26 },
  { file: '57.Daniel_Theodotionis_versio.txt', bookNum: 27 },
  { file: '36.Osee.txt', bookNum: 28 },
  { file: '39.Joel.txt', bookNum: 29 },
  { file: '37.Amos.txt', bookNum: 30 },
  { file: '40.Abdias.txt', bookNum: 31 },
  { file: '41.Jonas.txt', bookNum: 32 },
  { file: '38.Michaeas.txt', bookNum: 33 },
  { file: '42.Nahum.txt', bookNum: 34 },
  { file: '43.Habacuc.txt', bookNum: 35 },
  { file: '44.Sophonias.txt', bookNum: 36 },
  { file: '45.Aggaeus.txt', bookNum: 37 },
  { file: '46.Zacharias.txt', bookNum: 38 },
  { file: '47.Malachias.txt', bookNum: 39 },
];

/**
 * LXX Psalm (chapter, verse) -> MT/English (chapter, verse), covering the
 * merged/split psalms explicitly. Within a psalm, LXX verse numbering agrees
 * with the Hebrew tradition (superscription counted as verse 1), so after the
 * chapter mapping we resolve verses through the Hebrew versification_map that
 * the TAHOT ingest recorded on the spine.
 */
function mtPsalmRef(ch: number, v: number): { ch: number; v: number } | null {
  if (ch <= 8) return { ch, v };
  if (ch === 9) return v <= 21 ? { ch: 9, v } : { ch: 10, v: v - 21 };
  if (ch <= 112) return { ch: ch + 1, v };
  if (ch === 113) return v <= 8 ? { ch: 114, v } : { ch: 115, v: v - 8 };
  if (ch === 114) return { ch: 116, v };
  if (ch === 115) return { ch: 116, v: v + 9 };
  if (ch <= 145) return { ch: ch + 1, v };
  if (ch === 146) return { ch: 147, v };
  if (ch === 147) return { ch: 147, v: v + 11 };
  if (ch <= 150) return { ch, v };
  return null; // Psalm 151
}

function spineFor(
  core: Database,
  bookNum: number,
  chapter: number,
  verse: number,
  psalmMode?: 'hebrew' | 'identity',
): number | null {
  let b = bookNum;
  let c = chapter;
  let v = verse;
  if (bookNum === 15 && chapter > 10) {
    b = 16; // Nehemiah
    c = chapter - 10;
  }
  if (bookNum === 19) {
    const mt = mtPsalmRef(chapter, verse);
    if (mt === null) return null;
    c = mt.ch;
    v = mt.v;
    // Swete numbers titled psalms inconsistently: some count the
    // superscription as verse 1 (Hebrew-style), others don't. The caller
    // detects the mode per psalm; Hebrew-style verses resolve through the
    // Hebrew versification map (titles -> verse 0, shifted verses).
    if (psalmMode === 'hebrew') {
      const mapped = core
        .prepare(
          "SELECT spine_verse_id v FROM versification_map WHERE tradition='Hebrew' AND book_num=19 AND chapter=? AND verse=?",
        )
        .get(c, v) as { v: number } | undefined;
      if (mapped) return mapped.v;
    }
  }
  const id = makeVerseId(b, c, v);
  const hit = core.prepare('SELECT 1 FROM verses WHERE verse_id = ?').get(id);
  return hit ? id : null;
}

export function stageLxx(lxx: Database, core: Database): void {
  const base = fs
    .readdirSync(path.join(RAW, 'lxx'))
    .map((d) => path.join(RAW, 'lxx', d))
    .find((d) => fs.statSync(d).isDirectory() && fs.existsSync(path.join(d, 'data')));
  if (!base) throw new Error('lxx-swete not found in .cache/raw/lxx — run pipeline/download.sh');

  const ins = lxx.prepare(
    'INSERT OR REPLACE INTO lxx_verses (book_num, chapter, verse, text, text_norm, spine_verse_id) VALUES (?,?,?,?,?,?)',
  );
  let verses = 0;
  lxx.transaction(() => {
    for (const { file, bookNum } of FILES) {
      const full = path.join(base, 'data', file);
      if (!fs.existsSync(full)) {
        log(`lxx: missing ${file} — skipped`);
        continue;
      }
      const byVerse = new Map<string, string[]>();
      for (const line of fs.readFileSync(full, 'utf8').split('\n')) {
        const sp = line.indexOf(' ');
        if (sp < 0) continue;
        const ref = line.slice(0, sp);
        const word = line.slice(sp + 1).trim();
        if (!word) continue;
        const parts = ref.split('.');
        if (parts.length !== 3) continue;
        const key = `${parts[1]}.${parts[2]}`;
        if (!byVerse.has(key)) byVerse.set(key, []);
        byVerse.get(key)!.push(word);
      }
      // Per-psalm numbering mode: if the LXX psalm has more verses than its
      // English counterpart, its numbering counts the superscription
      // (Hebrew-style); otherwise verse numbers align with English directly.
      const psalmMode = new Map<number, 'hebrew' | 'identity'>();
      if (bookNum === 19) {
        const byCh = new Map<number, number[]>();
        for (const key of byVerse.keys()) {
          const [ch, v] = key.split('.').map((x) => parseInt(x, 10));
          if (!ch || !v) continue;
          if (!byCh.has(ch)) byCh.set(ch, []);
          byCh.get(ch)!.push(v);
        }
        const engMaxQ = core.prepare('SELECT MAX(verse_id % 1000) m FROM verses WHERE book_num=19 AND chapter=?');
        for (const [ch, vs] of byCh) {
          const target = mtPsalmRef(ch, 1)?.ch ?? ch;
          const engMax = (engMaxQ.get(target) as { m: number | null }).m ?? 0;
          // ignore stray outlier verse numbers (source anomalies)
          const lxxMax = Math.max(...vs.filter((v) => v <= engMax + 3), 0);
          psalmMode.set(ch, lxxMax > engMax ? 'hebrew' : 'identity');
        }
      }
      for (const [key, words] of byVerse) {
        const [ch, v] = key.split('.').map((x) => parseInt(x, 10));
        if (!ch || v === undefined || Number.isNaN(v)) continue;
        const text = words.join(' ');
        ins.run(bookNum, ch, v, text, normalizeGreek(text), spineFor(core, bookNum, ch, v, psalmMode.get(ch)));
        verses++;
      }
    }
  })();
  log(`LXX verses: ${verses}`);
}

/**
 * Verbal-parallel detection: shared runs of >= MIN_RUN identical normalized
 * words between LXX verses and NT (TAGNT default-stream) verses.
 */
export function stageQuotations(lxx: Database, study: Database): void {
  const MIN_RUN = 5;
  const MAX_LOCS = 40; // n-grams appearing in more locations are formulaic

  // 1. LXX n-gram index
  interface Loc { verseKey: number; pos: number }
  const gramIndex = new Map<string, Loc[]>();
  const lxxWords = new Map<number, string[]>(); // verseKey = book*1e6+ch*1e3+v (native)
  for (const row of lxx
    .prepare('SELECT book_num, chapter, verse, text_norm FROM lxx_verses')
    .iterate() as Iterable<{ book_num: number; chapter: number; verse: number; text_norm: string }>) {
    const words = row.text_norm.split(' ').filter(Boolean);
    const key = row.book_num * 1_000_000 + row.chapter * 1_000 + row.verse;
    lxxWords.set(key, words);
    for (let i = 0; i + MIN_RUN <= words.length; i++) {
      const gram = words.slice(i, i + MIN_RUN).join(' ');
      let locs = gramIndex.get(gram);
      if (!locs) {
        locs = [];
        gramIndex.set(gram, locs);
      }
      if (locs.length <= MAX_LOCS) locs.push({ verseKey: key, pos: i });
    }
  }
  log(`LXX ${MIN_RUN}-gram index: ${gramIndex.size} grams`);

  // 2. NT verses: normalized default-stream word sequence
  const ntVerses = study
    .prepare(
      `SELECT verse_id, group_concat(surface_norm, ' ') seq FROM (
         SELECT verse_id, word_num, surface_norm FROM words
         WHERE lang='G' AND is_default=1 AND part_num=1 AND verse_id >= 40000000
         ORDER BY verse_id, word_num)
       GROUP BY verse_id`,
    )
    .all() as Array<{ verse_id: number; seq: string }>;

  // 3. scan
  const best = new Map<string, { ntVerse: number; lxxKey: number; runLen: number; text: string }>();
  for (const nt of ntVerses) {
    const words = nt.seq.split(' ').filter(Boolean);
    for (let i = 0; i + MIN_RUN <= words.length; i++) {
      const gram = words.slice(i, i + MIN_RUN).join(' ');
      const locs = gramIndex.get(gram);
      if (!locs || locs.length > MAX_LOCS) continue;
      for (const loc of locs) {
        const lw = lxxWords.get(loc.verseKey)!;
        // extend the run greedily
        let len = MIN_RUN;
        while (i + len < words.length && loc.pos + len < lw.length && words[i + len] === lw[loc.pos + len]) len++;
        const key = `${nt.verse_id}:${loc.verseKey}`;
        const prev = best.get(key);
        if (!prev || len > prev.runLen) {
          best.set(key, { ntVerse: nt.verse_id, lxxKey: loc.verseKey, runLen: len, text: words.slice(i, i + len).join(' ') });
        }
      }
    }
  }

  const ins = lxx.prepare(
    `INSERT OR REPLACE INTO nt_quotations
      (nt_verse_id, lxx_book_num, lxx_chapter, lxx_verse, spine_ot_verse_id, run_len, shared_text)
     VALUES (?,?,?,?,?,?,?)`,
  );
  const spineOf = lxx.prepare('SELECT spine_verse_id v FROM lxx_verses WHERE book_num=? AND chapter=? AND verse=?');
  let rows = 0;
  lxx.transaction(() => {
    for (const q of best.values()) {
      const b = Math.floor(q.lxxKey / 1_000_000);
      const c = Math.floor((q.lxxKey % 1_000_000) / 1_000);
      const v = q.lxxKey % 1_000;
      const spine = (spineOf.get(b, c, v) as { v: number | null } | undefined)?.v ?? null;
      ins.run(q.ntVerse, b, c, v, spine, q.runLen, q.text);
      rows++;
    }
  })();
  log(`quotation links: ${rows}`);
}

export function verifyLxx(lxx: Database): void {
  const one = (sql: string, ...args: unknown[]): number =>
    (lxx.prepare(sql).get(...(args as [])) as { n: number }).n;
  const checkQ = (cond: boolean, msg: string): void => {
    if (!cond) throw new Error(`VERIFY FAILED (lxx): ${msg}`);
    log(`  ok: ${msg}`);
  };
  checkQ(one('SELECT COUNT(*) n FROM lxx_verses') > 20000, 'LXX verse count > 20k');
  checkQ(one('SELECT COUNT(*) n FROM nt_quotations WHERE run_len >= 5') > 500, 'quotation links > 500');
  // Matt 4:4 quotes Deut 8:3
  checkQ(
    one('SELECT COUNT(*) n FROM nt_quotations WHERE nt_verse_id=40004004 AND lxx_book_num=5 AND lxx_chapter=8 AND lxx_verse=3') === 1,
    'Matt 4:4 -> Deut 8:3 detected',
  );
  // Heb 1:5 quotes Ps 2:7
  checkQ(
    one('SELECT COUNT(*) n FROM nt_quotations WHERE nt_verse_id=58001005 AND lxx_book_num=19 AND lxx_chapter=2') === 1,
    'Heb 1:5 -> Ps 2:7 detected',
  );
}
