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
 * Verbal-parallel detection in three confidence tiers.
 *
 * quotation — contiguous run of >= 5 identical normalized words.
 * allusion  — exact 4-word run in which at least one word is non-formulaic
 *             (combined-corpus frequency <= GATE_FREQ), so strings of pure
 *             function words never qualify.
 * echo      — no contiguous run, but the verse pair shares >= 2 distinct rare
 *             words (frequency <= RARE_FREQ) — the Revelation pattern, which
 *             alludes constantly and quotes formally never.
 */
export function stageQuotations(lxx: Database, study: Database): void {
  const GRAM = 4; // index granularity (lowest tier that uses runs)
  const QUOTE_RUN = 5;
  const MAX_LOCS = 40; // n-grams in more locations are formulaic
  const GATE_FREQ = 300; // 'non-formulaic word' threshold for 4-word allusions
  const RARE_FREQ = 25; // 'rare word' threshold for echoes
  const ECHO_MIN_SHARED = 2;
  const ECHO_MAX_PER_NT = 5; // keep only the strongest echoes per NT verse

  // 0. Load texts
  const lxxWords = new Map<number, string[]>(); // verseKey = book*1e6+ch*1e3+v (native)
  for (const row of lxx
    .prepare('SELECT book_num, chapter, verse, text_norm FROM lxx_verses')
    .iterate() as Iterable<{ book_num: number; chapter: number; verse: number; text_norm: string }>) {
    const key = row.book_num * 1_000_000 + row.chapter * 1_000 + row.verse;
    lxxWords.set(key, row.text_norm.split(' ').filter(Boolean));
  }
  const ntVerses = (
    study
      .prepare(
        `SELECT verse_id, group_concat(surface_norm, ' ') seq FROM (
           SELECT verse_id, word_num, surface_norm FROM words
           WHERE lang='G' AND is_default=1 AND part_num=1 AND verse_id >= 40000000
           ORDER BY verse_id, word_num)
         GROUP BY verse_id`,
      )
      .all() as Array<{ verse_id: number; seq: string }>
  ).map((r) => ({ verseId: r.verse_id, words: r.seq.split(' ').filter(Boolean) }));

  // 1. Combined-corpus word frequencies (rarity is corpus-wide, not per-book)
  const freq = new Map<string, number>();
  const bump = (w: string): void => {
    freq.set(w, (freq.get(w) ?? 0) + 1);
  };
  for (const words of lxxWords.values()) for (const w of words) bump(w);
  for (const nt of ntVerses) for (const w of nt.words) bump(w);

  // 2. LXX 4-gram index
  interface Loc { verseKey: number; pos: number }
  const gramIndex = new Map<string, Loc[]>();
  for (const [key, words] of lxxWords) {
    for (let i = 0; i + GRAM <= words.length; i++) {
      const gram = words.slice(i, i + GRAM).join(' ');
      let locs = gramIndex.get(gram);
      if (!locs) {
        locs = [];
        gramIndex.set(gram, locs);
      }
      if (locs.length <= MAX_LOCS) locs.push({ verseKey: key, pos: i });
    }
  }
  log(`LXX ${GRAM}-gram index: ${gramIndex.size} grams`);

  // 3. Run detection (quotations + allusions)
  interface Hit { ntVerse: number; lxxKey: number; tier: string; level: 'surface' | 'lemma'; runLen: number; sharedRare: number; text: string }
  const best = new Map<string, Hit>();
  for (const nt of ntVerses) {
    const words = nt.words;
    for (let i = 0; i + GRAM <= words.length; i++) {
      const gram = words.slice(i, i + GRAM).join(' ');
      const locs = gramIndex.get(gram);
      if (!locs || locs.length > MAX_LOCS) continue;
      for (const loc of locs) {
        const lw = lxxWords.get(loc.verseKey)!;
        let len = GRAM;
        while (i + len < words.length && loc.pos + len < lw.length && words[i + len] === lw[loc.pos + len]) len++;
        if (len < QUOTE_RUN) {
          // 4-word allusion: require a non-formulaic word in the gram
          const gate = words.slice(i, i + GRAM).some((w) => (freq.get(w) ?? 0) <= GATE_FREQ);
          if (!gate) continue;
        }
        const key = `${nt.verseId}:${loc.verseKey}`;
        const prev = best.get(key);
        if (!prev || len > prev.runLen) {
          best.set(key, {
            ntVerse: nt.verseId,
            lxxKey: loc.verseKey,
            tier: len >= QUOTE_RUN ? 'quotation' : 'allusion',
            level: 'surface',
            runLen: len,
            sharedRare: 0,
            text: words.slice(i, i + len).join(' '),
          });
        }
      }
    }
  }
  const runCounts = { quotation: 0, allusion: 0 };
  for (const h of best.values()) runCounts[h.tier as 'quotation' | 'allusion']++;
  log(`runs: ${runCounts.quotation} quotations, ${runCounts.allusion} allusions`);

  // 4. Echo detection: shared rare vocabulary without a contiguous run
  const rareIndex = new Map<string, number[]>(); // rare form -> LXX verse keys
  for (const [key, words] of lxxWords) {
    const seen = new Set<string>();
    for (const w of words) {
      if (w.length < 4 || (freq.get(w) ?? 0) > RARE_FREQ || seen.has(w)) continue;
      seen.add(w);
      let list = rareIndex.get(w);
      if (!list) {
        list = [];
        rareIndex.set(w, list);
      }
      list.push(key);
    }
  }
  let echoes = 0;
  for (const nt of ntVerses) {
    const rare = [...new Set(nt.words.filter((w) => w.length >= 4 && (freq.get(w) ?? 0) <= RARE_FREQ))];
    if (rare.length < ECHO_MIN_SHARED) continue;
    const tally = new Map<number, string[]>();
    for (const w of rare) {
      for (const key of rareIndex.get(w) ?? []) {
        if (!tally.has(key)) tally.set(key, []);
        tally.get(key)!.push(w);
      }
    }
    const candidates = [...tally.entries()]
      .filter(([key, shared]) => shared.length >= ECHO_MIN_SHARED && !best.has(`${nt.verseId}:${key}`))
      .sort((a, z) => z[1].length - a[1].length)
      .slice(0, ECHO_MAX_PER_NT);
    for (const [key, shared] of candidates) {
      best.set(`${nt.verseId}:${key}`, {
        ntVerse: nt.verseId,
        lxxKey: key,
        tier: 'echo',
        level: 'surface',
        runLen: 0,
        sharedRare: shared.length,
        text: shared.join(' + '),
      });
      echoes++;
    }
  }
  log(`echoes: ${echoes}`);


  // 4b. Lemma-level pass: inflection-independent parallels. The lemma
  // dictionary comes from our own tagged NT (majority lemma per surface form)
  // and is applied to the LXX with identity fallback — it catches parallels
  // like Rev 1:7 <= Dan 7:13 where the wording matches but inflections differ.
  const lemmaOf = new Map<string, string>();
  {
    const votes = new Map<string, Map<string, number>>();
    for (const r of study
      .prepare("SELECT surface_norm s, lemma_norm l, COUNT(*) n FROM words WHERE lang='G' AND lemma_norm IS NOT NULL GROUP BY s, l")
      .iterate() as Iterable<{ s: string; l: string; n: number }>) {
      if (!votes.has(r.s)) votes.set(r.s, new Map());
      votes.get(r.s)!.set(r.l, (votes.get(r.s)!.get(r.l) ?? 0) + r.n);
    }
    for (const [surf, m] of votes) {
      let bestL: string | null = null;
      let bestN = 0;
      for (const [l, n] of m) if (n > bestN) { bestL = l; bestN = n; }
      if (bestL) lemmaOf.set(surf, bestL);
    }
  }
  const toLemmas = (ws: string[]): string[] => ws.map((w) => lemmaOf.get(w) ?? w);

  const lxxLemmas = new Map<number, string[]>();
  for (const [key, ws] of lxxWords) lxxLemmas.set(key, toLemmas(ws));
  const ntLemmaSeqs = ntVerses.map((nt) => ({ verseId: nt.verseId, words: toLemmas(nt.words) }));

  // lemma frequencies across the combined corpus
  const lfreq = new Map<string, number>();
  const lbump = (w: string): void => { lfreq.set(w, (lfreq.get(w) ?? 0) + 1); };
  for (const ws of lxxLemmas.values()) for (const w of ws) lbump(w);
  for (const nt of ntLemmaSeqs) for (const w of nt.words) lbump(w);

  const L_GRAM = 3;
  const L_GATE_DISTINCTIVE = 150; // 3-lemma runs need one lemma at least this rare
  const L_MAX_LOCS = 12;
  const lemmaIndex = new Map<string, Loc[]>();
  for (const [key, ws] of lxxLemmas) {
    for (let i = 0; i + L_GRAM <= ws.length; i++) {
      const gram = ws.slice(i, i + L_GRAM).join(' ');
      let locs = lemmaIndex.get(gram);
      if (!locs) { locs = []; lemmaIndex.set(gram, locs); }
      if (locs.length <= L_MAX_LOCS) locs.push({ verseKey: key, pos: i });
    }
  }
  const tierRank: Record<string, number> = { quotation: 3, allusion: 2, echo: 1 };
  let lemmaHits = 0;
  for (const nt of ntLemmaSeqs) {
    const ws = nt.words;
    for (let i = 0; i + L_GRAM <= ws.length; i++) {
      const gram = ws.slice(i, i + L_GRAM).join(' ');
      const locs = lemmaIndex.get(gram);
      if (!locs || locs.length > L_MAX_LOCS) continue;
      for (const loc of locs) {
        const lw = lxxLemmas.get(loc.verseKey)!;
        let len = L_GRAM;
        while (i + len < ws.length && loc.pos + len < lw.length && ws[i + len] === lw[loc.pos + len]) len++;
        let tier: string;
        if (len >= 4) tier = 'allusion';
        else {
          // 3-lemma runs must contain a distinctive lemma
          const gate = ws.slice(i, i + L_GRAM).some((w) => (lfreq.get(w) ?? 0) <= L_GATE_DISTINCTIVE);
          if (!gate) continue;
          tier = 'echo';
        }
        const key = `${nt.verseId}:${loc.verseKey}`;
        const prev = best.get(key);
        // lemma evidence never outranks surface evidence of the same strength
        if (prev && (tierRank[prev.tier]! > tierRank[tier]! || (tierRank[prev.tier] === tierRank[tier] && prev.runLen >= len))) continue;
        best.set(key, {
          ntVerse: nt.verseId,
          lxxKey: loc.verseKey,
          tier,
          level: 'lemma',
          runLen: len,
          sharedRare: 0,
          text: ws.slice(i, i + len).join(' '),
        });
        lemmaHits++;
      }
    }
  }
  log(`lemma-level hits: ${lemmaHits} (dictionary ${lemmaOf.size} forms)`);

  // 5. Store
  const ins = lxx.prepare(
    `INSERT OR REPLACE INTO nt_quotations
      (nt_verse_id, lxx_book_num, lxx_chapter, lxx_verse, spine_ot_verse_id, tier, match_level, run_len, shared_rare, shared_text)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  );
  const spineOf = lxx.prepare('SELECT spine_verse_id v FROM lxx_verses WHERE book_num=? AND chapter=? AND verse=?');
  let rows = 0;
  lxx.transaction(() => {
    for (const q of best.values()) {
      const b = Math.floor(q.lxxKey / 1_000_000);
      const c = Math.floor((q.lxxKey % 1_000_000) / 1_000);
      const v = q.lxxKey % 1_000;
      const spine = (spineOf.get(b, c, v) as { v: number | null } | undefined)?.v ?? null;
      ins.run(q.ntVerse, b, c, v, spine, q.tier, q.level, q.runLen, q.sharedRare, q.text);
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
  checkQ(one("SELECT COUNT(*) n FROM nt_quotations WHERE tier='quotation'") > 500, 'quotation tier > 500');
  checkQ(one("SELECT COUNT(*) n FROM nt_quotations WHERE tier='allusion'") > 2000, 'allusion tier > 2000');
  checkQ(one("SELECT COUNT(*) n FROM nt_quotations WHERE tier='echo'") > 300, 'echo tier > 300');
  // Rev 1:14 echoes Dan 7:9's Ancient of Days (wool, white, snow, flame) —
  // the Revelation pattern: dense allusion with no formal quotation
  checkQ(
    one("SELECT COUNT(*) n FROM nt_quotations WHERE nt_verse_id=66001014 AND lxx_book_num=27 AND lxx_chapter=7 AND lxx_verse=9 AND tier='echo'") === 1,
    'Rev 1:14 -> Dan 7:9 echo detected',
  );
  // Rev 1:7 <= Dan 7:13 'coming with the clouds' — only detectable at lemma
  // level (ερχεται vs ερχομενος differ in inflection)
  checkQ(
    one("SELECT COUNT(*) n FROM nt_quotations WHERE nt_verse_id=66001007 AND lxx_book_num=27 AND lxx_chapter=7 AND lxx_verse=13") >= 1,
    'Rev 1:7 -> Dan 7:13 lemma-level parallel detected',
  );
  // Matt 5:38 ('eye for eye, tooth for tooth') echoes its Torah sources
  checkQ(
    one('SELECT COUNT(*) n FROM nt_quotations WHERE nt_verse_id=40005038 AND lxx_book_num IN (2,3,5)') >= 2,
    'Matt 5:38 -> lex talionis echoes detected',
  );
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
