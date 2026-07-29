import type { Database } from 'better-sqlite3';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { RAW, log, normalizeGreek, splitStrongs } from '../lib.js';

const htmlToText = (s: string): string =>
  s
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();

/**
 * STEPBible TBESG brief Greek lexicon (extended Abbott-Smith, CC BY).
 * NOTE: TBESH (Hebrew) is deliberately NOT ingested — its header requires
 * permission from Online Bible for its abridged-BDB definitions. Hebrew uses
 * the public-domain BDB (Enhanced) instead.
 */
function ingestTbesg(db: Database): void {
  const insEntry = db.prepare(
    `INSERT OR REPLACE INTO lexicon_entries
      (lexicon_id, strongs, strongs_num, lemma, translit, pos, short_gloss, definition)
     VALUES (?,?,?,?,?,?,?,?)`,
  );
  const insLink = db.prepare('INSERT OR IGNORE INTO lexicon_links (strongs, rel, target) VALUES (?,?,?)');
  let count = 0;
  db.transaction(() => {
    const content = fs.readFileSync(path.join(RAW, 'stepbible', 'TBESG.txt'), 'utf8');
    for (const line of content.split('\n')) {
      const c = line.replace(/\r$/, '').split('\t');
      if (c.length < 8 || !/^G\d{4}/.test(c[0] ?? '')) continue;
      const extMatch = (c[1] ?? '').match(/^(G\d{4}[A-Za-z]?)\s*=\s*(.*)$/);
      const ext = extMatch ? extMatch[1]! : c[0]!;
      const st = splitStrongs(ext);
      if (!st) continue;
      insEntry.run(
        'tbesg',
        st.strongs,
        st.num,
        (c[3] ?? '').trim() || null,
        (c[4] ?? '').trim() || null,
        (c[5] ?? '').trim() || null,
        (c[6] ?? '').trim() || null,
        htmlToText(c[7] ?? '') || null,
      );
      const relNote = extMatch ? extMatch[2]!.trim() : '';
      const target = (c[2] ?? '').trim().replace(/[,;].*$/, '');
      if (relNote && /^[HG]\d{4}/.test(target) && target !== ext) {
        insLink.run(st.strongs, relNote.toLowerCase().replace(/\s+/g, '-'), target);
      }
      count++;
    }
  })();
  log(`tbesg: ${count} entries`);
}

/**
 * BDB Enhanced: public-domain Brown-Driver-Briggs with CC BY enhancements.
 * One HTML file per BDB entry + a BDB->Strong's mapping CSV.
 */
function ingestBdb(db: Database): void {
  const base = fs
    .readdirSync(path.join(RAW, 'bdb'))
    .map((d) => path.join(RAW, 'bdb', d))
    .find((d) => fs.statSync(d).isDirectory());
  if (!base) throw new Error('BDB Enhanced not found in .cache/raw/bdb — unzip bdb-enhanced there first.');

  // mapping: bdb,strongs,LemmaGuess (strongs H0000 = unmapped)
  const byStrongs = new Map<string, { lemmas: Set<string>; defs: string[]; pos: Set<string>; glosses: Set<string> }>();
  const mapping = new Map<string, Set<string>>();
  for (const line of fs.readFileSync(path.join(base, 'bdbToStrongsMapping.csv'), 'utf8').split('\n').slice(1)) {
    const [bdb, strongs] = line.trim().split(',');
    if (!bdb || !strongs || strongs === 'H0000') continue;
    if (!mapping.has(bdb)) mapping.set(bdb, new Set());
    mapping.get(bdb)!.add(strongs);
  }

  const entriesDir = path.join(base, 'Entries');
  let files = 0;
  for (const file of fs.readdirSync(entriesDir)) {
    if (!file.endsWith('.html')) continue;
    const bdbId = file.replace(/\.html$/, '');
    const strongsSet = mapping.get(bdbId);
    if (!strongsSet) continue;
    const html = fs.readFileSync(path.join(entriesDir, file), 'utf8');
    const body = html.replace(/^[\s\S]*?<\/h1>/, '').replace(/<script[\s\S]*?<\/script>/g, '');
    const def = htmlToText(body);
    if (!def) continue;
    const lemma = html.match(/<bdbheb>([^<]+)<\/bdbheb>/)?.[1]?.trim();
    const pos = html.match(/<pos>([^<]+)<\/pos>/)?.[1]?.trim();
    const gloss = html.match(/<primary>([^<]+)<\/primary>/)?.[1]?.trim();
    for (const strongsRaw of strongsSet) {
      const st = splitStrongs(strongsRaw);
      if (!st) continue;
      let agg = byStrongs.get(st.strongs);
      if (!agg) {
        agg = { lemmas: new Set(), defs: [], pos: new Set(), glosses: new Set() };
        byStrongs.set(st.strongs, agg);
      }
      if (lemma) agg.lemmas.add(lemma);
      if (pos) agg.pos.add(pos);
      if (gloss) agg.glosses.add(gloss);
      agg.defs.push(def.length > 6000 ? def.slice(0, 6000) + ' …' : def);
    }
    files++;
  }

  const insEntry = db.prepare(
    `INSERT OR REPLACE INTO lexicon_entries
      (lexicon_id, strongs, strongs_num, lemma, translit, pos, short_gloss, definition)
     VALUES (?,?,?,?,?,?,?,?)`,
  );
  let count = 0;
  db.transaction(() => {
    for (const [strongs, agg] of byStrongs) {
      const st = splitStrongs(strongs)!;
      insEntry.run(
        'bdb',
        st.strongs,
        st.num,
        [...agg.lemmas][0] ?? null,
        null,
        [...agg.pos][0] ?? null,
        [...agg.glosses].slice(0, 3).join('; ') || null,
        agg.defs.join('\n———\n'),
      );
      count++;
    }
  })();
  log(`bdb: ${count} entries from ${files} BDB articles`);
}

/** Dodson Greek lexicon CSV (tab-separated, quoted): strongs, GK, betacode word, brief, long. */
function ingestDodson(db: Database): void {
  const insEntry = db.prepare(
    `INSERT OR REPLACE INTO lexicon_entries
      (lexicon_id, strongs, strongs_num, lemma, translit, pos, short_gloss, definition)
     VALUES (?,?,?,?,?,?,?,?)`,
  );
  const unquote = (s: string): string => s.replace(/^"|"$/g, '').replace(/""/g, '"').trim();
  let count = 0;
  db.transaction(() => {
    const content = fs.readFileSync(path.join(RAW, 'dodson', 'dodson.csv'), 'utf8');
    for (const line of content.split('\n').slice(1)) {
      const c = line.replace(/\r$/, '').split('\t').map(unquote);
      if (c.length < 5 || !/^\d+$/.test(c[0] ?? '')) continue;
      const num = parseInt(c[0]!, 10);
      insEntry.run('dodson', `G${String(num).padStart(4, '0')}`, num, null, null, null, c[3] || null, c[4] || null);
      count++;
    }
  })();
  log(`dodson: ${count} entries`);
}

export function stageLexicons(db: Database): void {
  const insLex = db.prepare('INSERT OR REPLACE INTO lexicons (lexicon_id, title, lang, source_id) VALUES (?,?,?,?)');
  insLex.run('bdb', 'Brown-Driver-Briggs Hebrew Lexicon (Enhanced)', 'H', 'bdb-enhanced');
  insLex.run('tbesg', "Translators Brief Lexicon of Extended Strongs for Greek (ext. Abbott-Smith)", 'G', 'stepbible-tbesg');
  insLex.run('dodson', 'Dodson Greek-English Lexicon', 'G', 'dodson');
  ingestBdb(db);
  ingestTbesg(db);
  ingestDodson(db);
}

/**
 * Post-pass after words + lexicons:
 * 1. Resolve crasis-component lemmas from TBESG (their source row carried the
 *    combined form's lemma, which belongs to no single component).
 * 2. Synthesize lexicon entries for STEPBible synthetic affix codes (H9xxx)
 *    from their actual usage, so every tagged Strong's resolves.
 * 3. Backfill Hebrew lexicon transliterations from the tagged text so
 *    `bible word chesed` works.
 * Then build the lexicon FTS index.
 */
export function stageLexiconPostPass(db: Database): void {
  // Single scan over words: majority lemma/gloss/pos/translit per Strong's.
  interface Tally {
    n: number;
    lemma: Map<string, number>;
    gloss: Map<string, number>;
    pos: Map<string, number>;
    translit: Map<string, number>;
  }
  const tally = new Map<string, Tally>();
  const bump = (m: Map<string, number>, k: string | null): void => {
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  };
  for (const w of db
    .prepare(
      `SELECT strongs, strongs_num, lemma, gloss, pos,
              CASE WHEN surface_norm = lemma_norm THEN translit ELSE NULL END translit
       FROM words WHERE strongs IS NOT NULL`,
    )
    .iterate() as Iterable<{ strongs: string; strongs_num: number; lemma: string | null; gloss: string | null; pos: string | null; translit: string | null }>) {
    let t = tally.get(w.strongs);
    if (!t) {
      t = { n: 0, lemma: new Map(), gloss: new Map(), pos: new Map(), translit: new Map() };
      tally.set(w.strongs, t);
    }
    t.n++;
    bump(t.lemma, w.lemma);
    bump(t.gloss, w.gloss);
    bump(t.pos, w.pos);
    bump(t.translit, w.translit ? w.translit.replace(/[.·'’\/-]/g, '').toLowerCase() : null);
  }
  const top = (m: Map<string, number>): string | null => {
    let best: string | null = null;
    let bestN = 0;
    for (const [k, n] of m) if (n > bestN) { best = k; bestN = n; }
    return best;
  };
  const numOf = (strongs: string): number => parseInt(strongs.slice(1).replace(/[A-Za-z]$/, ''), 10);

  // 1. Crasis-component lemmas from TBESG (source rows carried the combined form's lemma).
  const crasis = db
    .prepare(`SELECT DISTINCT strongs FROM words WHERE lang='G' AND lemma IS NULL AND strongs IS NOT NULL`)
    .all() as Array<{ strongs: string }>;
  const getLemma = db.prepare(
    `SELECT lemma FROM lexicon_entries WHERE lexicon_id='tbesg' AND lemma IS NOT NULL AND (strongs = ? OR strongs_num = ?) LIMIT 1`,
  );
  const setLemma = db.prepare(`UPDATE words SET lemma = ?, lemma_norm = ? WHERE lang='G' AND lemma IS NULL AND strongs = ?`);
  let fixed = 0;
  db.transaction(() => {
    for (const c of crasis) {
      const row = getLemma.get(c.strongs, numOf(c.strongs)) as { lemma: string } | undefined;
      if (row?.lemma) {
        const lemma = row.lemma.split(',')[0]!.trim();
        setLemma.run(lemma, normalizeGreek(lemma), c.strongs);
        fixed++;
      }
    }
  })();
  log(`crasis lemmas resolved for ${fixed} strongs`);

  // 2. Affix/grammar codes (H9001+) get derived entries so every tag resolves.
  const insAffix = db.prepare(
    `INSERT OR IGNORE INTO lexicon_entries (lexicon_id, strongs, strongs_num, lemma, translit, pos, short_gloss, definition)
     VALUES ('affixes', ?, ?, ?, NULL, ?, ?, ?)`,
  );
  let affixN = 0;
  db.transaction(() => {
    db.prepare(
      `INSERT OR REPLACE INTO lexicons (lexicon_id, title, lang, source_id) VALUES ('affixes', 'Grammatical affixes and particles (derived from TAHOT tagging)', 'HG', 'stepbible-tahot')`,
    ).run();
    for (const [strongs, t] of tally) {
      const num = numOf(strongs);
      if (num < 9000) continue;
      insAffix.run(
        strongs, num, top(t.lemma), top(t.pos), top(t.gloss) ?? '(grammatical element)',
        `Grammatical element: ${top(t.pos) ?? 'affix'} '${top(t.lemma) ?? ''}' glossed '${top(t.gloss) ?? ''}' — ${t.n} occurrences in the tagged text.`,
      );
      affixN++;
    }
  })();
  log(`affix entries: ${affixN}`);

  // 3. Remaining gaps (mostly Aramaic missing from the BDB mapping): entries
  //    synthesized from the tagging itself, so every tagged Strong's resolves.
  const known = new Set(
    (db.prepare('SELECT DISTINCT strongs FROM lexicon_entries').all() as Array<{ strongs: string }>).map((r) => r.strongs),
  );
  // number coverage keyed by language: H376 and G376 are unrelated words
  const knownNum = new Set(
    (db.prepare('SELECT DISTINCT substr(strongs,1,1) l, strongs_num FROM lexicon_entries').all() as Array<{ l: string; strongs_num: number }>).map(
      (r) => `${r.l}:${r.strongs_num}`,
    ),
  );
  const insGap = db.prepare(
    `INSERT OR IGNORE INTO lexicon_entries (lexicon_id, strongs, strongs_num, lemma, translit, pos, short_gloss, definition)
     VALUES ('tagged', ?, ?, ?, ?, ?, ?, ?)`,
  );
  let gapN = 0;
  db.transaction(() => {
    db.prepare(
      `INSERT OR REPLACE INTO lexicons (lexicon_id, title, lang, source_id) VALUES ('tagged', 'Entries derived from TAHOT/TAGNT tagging (no formal lexicon entry available)', 'HG', 'stepbible-tahot')`,
    ).run();
    for (const [strongs, t] of tally) {
      const num = numOf(strongs);
      if (num >= 9000 || known.has(strongs) || knownNum.has(`${strongs[0]}:${num}`)) continue;
      const tr = top(t.translit);
      insGap.run(
        strongs, num, top(t.lemma), tr, top(t.pos), top(t.gloss) ?? '(no gloss)',
        `Derived from the tagged text: ${top(t.pos) ?? 'word'} '${top(t.lemma) ?? ''}' glossed '${top(t.gloss) ?? ''}' — ${t.n} tagged occurrences. No formal lexicon entry available for this Strong's number in the bundled lexicons.`,
      );
      gapN++;
    }
  })();
  log(`gap entries synthesized from tagging: ${gapN}`);

  // 4. Hebrew lexicon transliterations from the tagged text ('che.sed' -> 'chesed').
  const hebEntries = db
    .prepare(`SELECT strongs FROM lexicon_entries WHERE lexicon_id='bdb' AND translit IS NULL`)
    .all() as Array<{ strongs: string }>;
  // majority translit by base number so H2617A resolves from H2617G rows too
  const byNum = new Map<number, Map<string, number>>();
  for (const [strongs, t] of tally) {
    if (!strongs.startsWith('H')) continue; // bdb is Hebrew; never mix G translits
    const num = numOf(strongs);
    if (!byNum.has(num)) byNum.set(num, new Map());
    const agg = byNum.get(num)!;
    for (const [k, n] of t.translit) agg.set(k, (agg.get(k) ?? 0) + n);
  }
  const setTr = db.prepare(`UPDATE lexicon_entries SET translit = ? WHERE lexicon_id='bdb' AND strongs = ?`);
  let trs = 0;
  db.transaction(() => {
    for (const e of hebEntries) {
      const exact = tally.get(e.strongs);
      const cand = exact ? top(exact.translit) : top(byNum.get(numOf(e.strongs)) ?? new Map());
      if (cand) {
        setTr.run(cand, e.strongs);
        trs++;
      }
    }
  })();
  log(`bdb transliterations backfilled: ${trs}`);

  db.exec(`
    INSERT INTO lexicon_fts (short_gloss, definition, lexicon_id, strongs)
      SELECT short_gloss, definition, lexicon_id, strongs FROM lexicon_entries;
    INSERT INTO lexicon_fts(lexicon_fts) VALUES('optimize');
  `);
  log('lexicon FTS built');
}
