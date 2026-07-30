import type { Database } from 'better-sqlite3';
import { log } from '../lib.js';

/**
 * Inner-biblical parallels computed from lemma n-grams, within each testament:
 * OT vs OT on Hebrew/Aramaic lemmas (Kings↔Chronicles, Psalm doublets,
 * Isaiah↔Micah), NT vs NT on Greek lemmas (Synoptics, Jude↔2 Peter,
 * Ephesians↔Colossians). Same tiering philosophy as the LXX quotation engine
 * (stages/lxx.ts), but symmetric within one corpus:
 *
 * parallel — contiguous shared run of >= 5 lemmas (near-verbatim wording)
 * allusion — exact 4-lemma run
 * echo     — exact 3-lemma run in which EVERY lemma is rare (verse document
 *            frequency <= ECHO_MAX_DF), so formulaic function-lemma strings
 *            never qualify; OR a 3-lemma run whose exact wording is nearly
 *            unique in the corpus (3-gram in <= ECHO_GRAM_MAX_DF verses)
 *            anchored by at least one rare lemma — the Jude 18 ↔ 2 Pet 3:3
 *            seam ('mockers... following', εμπαικτησ κατα ο), where a
 *            reworked quotation leaves only a short verbatim overlap
 *
 * Both run tiers additionally require the shared run to be distinctive in one
 * of two ways: it contains a rare-ish lemma (df <= DISTINCTIVE_DF), or its
 * exact wording is rare as a phrase (EVERY constituent 3-gram appears in
 * <= RUN_GRAM_MAX_DF verses AND its rarest lemma is at most mid-frequency,
 * df <= 2*DISTINCTIVE_DF — the Micah 4:1 ↔ Isa 2:2 case, where every word is
 * common but the combination is unique; the anchor requirement keeps out
 * pure function-word strings that happen to share an uncommon order). Stock formulas like 'thus says
 * the Lord GOD' / 'the word of the LORD came to' / 'Jesus said to them' fail
 * both tests and would otherwise dominate the table (measured: ~25k of 54k
 * OT rows were speech-formula pairs before this gate).
 *
 * Verse pairs whose neighbors also pair (v/v+1 ↔ w/w+1 …) are merged into
 * ranges, so a parallel chapter (2 Kings 19 ↔ Isaiah 37) is one row, not 35.
 */

const K = 3; // index granularity: lowest tier that uses runs
const PARALLEL_RUN = 5;
const ALLUSION_RUN = 4;
const ECHO_MAX_DF = 50; // 'rare lemma' = appears in <= 50 verses of the corpus
// 'distinctive lemma' gate for run tiers: ~1.3% of corpus verses
// (OT 23,261 verses, NT 7,916 — keeps αμην/'amen I say to you' formulaic)
const DISTINCTIVE_DF: Record<'ot' | 'nt', number> = { ot: 300, nt: 100 };
const RUN_GRAM_MAX_DF = 25; // 'distinctive phrase': a 3-gram in <= 25 verses
const ECHO_GRAM_MAX_DF = 5; // echo via nearly-unique wording + rare anchor
const MAX_GRAM_VERSES = 200; // grams in more verses are formulaic boilerplate
const NEAR_VERSES = 2; // ignore pairs within 2 verses in the same chapter
const CHAIN_GAP = 2; // range merging tolerates one non-pairing verse

/** DDL used by both schema/study.sql (fresh build) and rebuild-parallels.ts. */
export const PARALLELS_DDL = `
CREATE TABLE text_parallels (
  id            INTEGER PRIMARY KEY,
  corpus        TEXT NOT NULL CHECK (corpus IN ('ot','nt')),
  a_start       INTEGER NOT NULL,          -- spine verse ids; a_start < b_start
  a_end         INTEGER NOT NULL,
  b_start       INTEGER NOT NULL,
  b_end         INTEGER NOT NULL,
  tier          TEXT NOT NULL CHECK (tier IN ('parallel','allusion','echo')),
  run_len       INTEGER NOT NULL,          -- longest shared lemma run in the range
  shared_lemmas TEXT NOT NULL,             -- lemmas of that longest run
  n_verses      INTEGER NOT NULL           -- verse pairs merged into this range
);
CREATE INDEX idx_parallels_a ON text_parallels(a_start, a_end);
CREATE INDEX idx_parallels_b ON text_parallels(b_start, b_end);
`;

interface Pair {
  a: number; // verse id, a < b
  b: number;
  runLen: number;
  lemmas: string;
}

interface Chain {
  aStart: number;
  aEnd: number;
  bStart: number;
  bEnd: number;
  tier: string;
  runLen: number;
  lemmas: string;
  n: number;
}

function tierOf(runLen: number): string {
  return runLen >= PARALLEL_RUN ? 'parallel' : runLen >= ALLUSION_RUN ? 'allusion' : 'echo';
}

const TIER_RANK: Record<string, number> = { parallel: 3, allusion: 2, echo: 1 };

/** Load per-verse content-lemma sequences for one corpus (default stream only). */
function loadSeqs(study: Database, corpus: 'ot' | 'nt'): Map<number, string[]> {
  // Hebrew prefix/suffix morphemes (H9xxx: and/the/in/pronominal suffixes) are
  // pure noise for parallel detection — drop them, keep content lemmas.
  const langSql = corpus === 'ot' ? "lang IN ('H','A')" : "lang = 'G'";
  const seqs = new Map<number, string[]>();
  for (const row of study
    .prepare(
      `SELECT verse_id v, lemma_norm l FROM words
       WHERE ${langSql} AND is_default = 1 AND lemma_norm IS NOT NULL
         AND (strongs_num IS NULL OR strongs_num < 9000)
       ORDER BY verse_id, word_num, part_num`,
    )
    .iterate() as Iterable<{ v: number; l: string }>) {
    let seq = seqs.get(row.v);
    if (!seq) {
      seq = [];
      seqs.set(row.v, seq);
    }
    seq.push(row.l);
  }
  return seqs;
}

function buildCorpus(study: Database, corpus: 'ot' | 'nt'): Chain[] {
  const t0 = Date.now();
  const gateDf = DISTINCTIVE_DF[corpus];
  const seqs = loadSeqs(study, corpus);
  const verses = [...seqs.keys()].sort((x, y) => x - y);
  const ordinal = new Map<number, number>();
  verses.forEach((v, i) => ordinal.set(v, i));

  // Lemma verse-document-frequency (for the echo rarity gate).
  const df = new Map<string, number>();
  for (const seq of seqs.values()) {
    for (const l of new Set(seq)) df.set(l, (df.get(l) ?? 0) + 1);
  }

  // K-gram index: gram -> flat [verseId, pos, ...]; tombstoned (null) once the
  // gram appears in more than MAX_GRAM_VERSES verses (formulaic boilerplate).
  interface GramEntry {
    locs: number[] | null;
    nVerses: number;
    lastVerse: number;
  }
  const gramAt = (seq: string[], i: number): string => `${seq[i]}\u001f${seq[i + 1]}\u001f${seq[i + 2]}`;
  const index = new Map<string, GramEntry>();
  for (const v of verses) {
    const seq = seqs.get(v)!;
    for (let i = 0; i + K <= seq.length; i++) {
      const gram = gramAt(seq, i);
      let e = index.get(gram);
      if (!e) {
        e = { locs: [], nVerses: 0, lastVerse: -1 };
        index.set(gram, e);
      }
      if (e.locs === null) continue;
      if (v !== e.lastVerse) {
        e.nVerses++;
        e.lastVerse = v;
        if (e.nVerses > MAX_GRAM_VERSES) {
          e.locs = null; // formulaic — never a candidate source
          continue;
        }
      }
      e.locs.push(v, i);
    }
  }

  // Per-verse phrase rarity: gramDf[i] = verses containing the 3-gram at i
  // (tombstoned grams are frozen at MAX_GRAM_VERSES + 1, correctly 'common').
  const gramDfOf = new Map<number, Int32Array>();
  for (const v of verses) {
    const seq = seqs.get(v)!;
    if (seq.length < K) continue;
    const arr = new Int32Array(seq.length - K + 1);
    for (let i = 0; i + K <= seq.length; i++) arr[i] = index.get(gramAt(seq, i))!.nVerses;
    gramDfOf.set(v, arr);
  }

  // Candidate pairs: verses sharing a live gram; extend each hit to the
  // maximal shared run, dedupe hits that fall inside an already-found run.
  const pairKey = (a: number, b: number): number => a * 100_000_000 + b;
  interface Run {
    sa: number;
    sb: number;
    len: number;
  }
  const runsByPair = new Map<number, Run[]>();
  const best = new Map<number, Pair>();
  let candidates = 0;

  for (const e of index.values()) {
    const locs = e.locs;
    if (locs === null || locs.length < 4) continue;
    for (let i = 0; i < locs.length; i += 2) {
      const va = locs[i]!;
      const pa = locs[i + 1]!;
      for (let j = i + 2; j < locs.length; j += 2) {
        const vb = locs[j]!;
        if (vb === va) continue; // self
        const pb = locs[j + 1]!;
        // immediate-context repetition: within NEAR_VERSES in the same chapter
        if (Math.floor(va / 1000) === Math.floor(vb / 1000) && vb - va <= NEAR_VERSES) continue;
        candidates++;
        const key = pairKey(va, vb);
        const known = runsByPair.get(key);
        if (known) {
          const diff = pb - pa;
          let covered = false;
          for (const r of known) {
            if (r.sb - r.sa === diff && pa >= r.sa && pa + K <= r.sa + r.len) {
              covered = true;
              break;
            }
          }
          if (covered) continue;
        }
        // extend to the maximal shared run around this gram
        const A = seqs.get(va)!;
        const B = seqs.get(vb)!;
        let sa = pa;
        let sb = pb;
        while (sa > 0 && sb > 0 && A[sa - 1] === B[sb - 1]) {
          sa--;
          sb--;
        }
        let ea = pa + K;
        let eb = pb + K;
        while (ea < A.length && eb < B.length && A[ea] === B[eb]) {
          ea++;
          eb++;
        }
        const len = ea - sa;
        let qualifies: boolean;
        if (len >= ALLUSION_RUN) {
          // run tiers: distinctive by rare lemma OR rare phrase (see header)
          let minDf = Infinity;
          for (let k = sa; k < ea; k++) {
            const d = df.get(A[k]!) ?? 0;
            if (d < minDf) minDf = d;
          }
          qualifies = minDf <= gateDf;
          if (!qualifies && minDf <= 2 * gateDf) {
            const gd = gramDfOf.get(va)!;
            let maxGramDf = 0;
            for (let k = sa; k + K <= ea; k++) {
              if (gd[k]! > maxGramDf) maxGramDf = gd[k]!;
            }
            qualifies = maxGramDf <= RUN_GRAM_MAX_DF;
          }
        } else {
          // 3-lemma run: every lemma rare, or nearly-unique phrase + rare anchor
          let allRare = true;
          let minDf = Infinity;
          for (let k = sa; k < ea; k++) {
            const d = df.get(A[k]!) ?? 0;
            if (d > ECHO_MAX_DF) allRare = false;
            if (d < minDf) minDf = d;
          }
          qualifies =
            allRare || (minDf <= ECHO_MAX_DF && gramDfOf.get(va)![sa]! <= ECHO_GRAM_MAX_DF);
          if (!qualifies) continue; // a lone 3-gram cannot recur — skip dedupe bookkeeping
        }
        // record even gated-out 4+ runs so their other sub-grams dedupe cheaply
        let runs = runsByPair.get(key);
        if (!runs) {
          runs = [];
          runsByPair.set(key, runs);
        }
        runs.push({ sa, sb, len });
        if (!qualifies) continue;
        const prev = best.get(key);
        if (!prev || len > prev.runLen) {
          best.set(key, { a: va, b: vb, runLen: len, lemmas: A.slice(sa, ea).join(' ') });
        }
      }
    }
  }

  // Merge diagonal chains of verse pairs into ranges: pair (a,b) continues a
  // chain ending at (a',b') when both sides advance by 1..CHAIN_GAP verses.
  const pairs = [...best.values()].sort((x, y) => x.a - y.a || x.b - y.b);
  const chainAt = new Map<number, Chain>(); // key: aOrd * 1e6 + bOrd of chain tail
  const chains: Chain[] = [];
  const tailKey = (aOrd: number, bOrd: number): number => aOrd * 1_000_000 + bOrd;
  const bookOf = (v: number): number => Math.floor(v / 1_000_000);
  for (const p of pairs) {
    const aOrd = ordinal.get(p.a)!;
    const bOrd = ordinal.get(p.b)!;
    let chain: Chain | undefined;
    outer: for (let da = 1; da <= CHAIN_GAP; da++) {
      for (let db = 1; db <= CHAIN_GAP; db++) {
        const k = tailKey(aOrd - da, bOrd - db);
        const c = chainAt.get(k);
        // corpus ordinals run across book boundaries — never chain a range
        // into the next book (Judges 21:25 must not extend into Ruth 1:1)
        if (c && bookOf(c.aEnd) === bookOf(p.a) && bookOf(c.bEnd) === bookOf(p.b)) {
          chain = c;
          chainAt.delete(k);
          break outer;
        }
      }
    }
    const tier = tierOf(p.runLen);
    if (chain) {
      chain.aEnd = p.a;
      chain.bEnd = p.b;
      chain.n++;
      if (TIER_RANK[tier]! > TIER_RANK[chain.tier]!) chain.tier = tier;
      if (p.runLen > chain.runLen) {
        chain.runLen = p.runLen;
        chain.lemmas = p.lemmas;
      }
    } else {
      chain = { aStart: p.a, aEnd: p.a, bStart: p.b, bEnd: p.b, tier, runLen: p.runLen, lemmas: p.lemmas, n: 1 };
      chains.push(chain);
    }
    chainAt.set(tailKey(aOrd, bOrd), chain);
  }

  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  log(
    `parallels(${corpus}): ${seqs.size} verses, ${index.size} grams, ${candidates} candidates, ` +
      `${best.size} verse pairs -> ${chains.length} ranges (${secs}s)`,
  );
  return chains;
}

export function stageParallels(study: Database): void {
  study.exec('DELETE FROM text_parallels');
  const ins = study.prepare(
    `INSERT INTO text_parallels (corpus, a_start, a_end, b_start, b_end, tier, run_len, shared_lemmas, n_verses)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  );
  for (const corpus of ['ot', 'nt'] as const) {
    const chains = buildCorpus(study, corpus);
    study.transaction(() => {
      for (const c of chains) ins.run(corpus, c.aStart, c.aEnd, c.bStart, c.bEnd, c.tier, c.runLen, c.lemmas, c.n);
    })();
    const byTier = study
      .prepare('SELECT tier, COUNT(*) n FROM text_parallels WHERE corpus = ? GROUP BY tier')
      .all(corpus) as Array<{ tier: string; n: number }>;
    log(`parallels(${corpus}): ${byTier.map((r) => `${r.n} ${r.tier}`).join(', ')}`);
  }
}

export function verifyParallels(study: Database): void {
  log('verifying parallels...');
  const one = (sql: string, ...args: unknown[]): number =>
    (study.prepare(sql).get(...(args as [])) as { n: number }).n;
  const check = (cond: boolean, msg: string): void => {
    if (!cond) throw new Error(`VERIFY FAILED (parallels): ${msg}`);
    log(`  ok: ${msg}`);
  };
  // 2 Kings 19 ↔ Isaiah 37 are near-verbatim parallel chapters
  check(
    one(
      `SELECT COUNT(*) n FROM text_parallels WHERE corpus='ot' AND tier='parallel'
       AND a_start < 12020000 AND a_end >= 12019001 AND b_start < 23038000 AND b_end >= 23037001`,
    ) >= 1,
    '2 Kings 19 ↔ Isaiah 37 parallel detected',
  );
  // Psalm 14 ↔ Psalm 53 doublet
  check(
    one(
      `SELECT COUNT(*) n FROM text_parallels WHERE corpus='ot' AND tier='parallel'
       AND a_start < 19015000 AND a_end >= 19014001 AND b_start < 19054000 AND b_end >= 19053001`,
    ) >= 1,
    'Psalm 14 ↔ Psalm 53 doublet detected',
  );
  // 2 Peter 2 ↔ Jude share extensive wording
  check(
    one(
      `SELECT COUNT(*) n FROM text_parallels WHERE corpus='nt'
       AND a_start >= 61002000 AND a_end < 61003000 AND b_start >= 65001000 AND tier IN ('parallel','allusion')`,
    ) >= 1,
    '2 Peter 2 ↔ Jude parallel detected',
  );
  // Synoptics: Matthew 3 ↔ Luke 3 (John the Baptist material)
  check(
    one(
      `SELECT COUNT(*) n FROM text_parallels WHERE corpus='nt' AND tier='parallel'
       AND a_start >= 40003000 AND a_end < 40004000 AND b_start >= 42003000 AND b_start < 42004000`,
    ) >= 1,
    'Matthew 3 ↔ Luke 3 parallel detected',
  );
  check(one("SELECT COUNT(*) n FROM text_parallels WHERE corpus='ot'") > 2000, 'OT parallels > 2000');
  check(one("SELECT COUNT(*) n FROM text_parallels WHERE corpus='nt'") > 1000, 'NT parallels > 1000');
  check(
    one('SELECT COUNT(*) n FROM text_parallels WHERE a_start/1000000 != a_end/1000000 OR b_start/1000000 != b_end/1000000') === 0,
    'no merged range crosses a book boundary',
  );
}
