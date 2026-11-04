/**
 * BSB ⇄ original-language word alignment from the Berean BSB translation
 * tables (bereanbible.com/bsb_tables.tsv, public domain since 2023-04-30).
 *
 * The tables have one row per Hebrew/Aramaic/Greek word, in BSB English
 * order, with the word's BSB rendering. We ship only what we need: character
 * spans into OUR core BSB verse text, links to OUR TAHOT/TAGNT `words` rows,
 * rendering counts, and BSB section headings + paragraph marks. We do not
 * ship the tables' Greek/Hebrew text or parsing columns.
 *
 * Rendering markup in the tables:
 *   ' the heavens '      plain rendering → a span
 *   ' [was] good '       [..] supplied for English sense (in the BSB text)
 *   ' and I {will remain} ' {..} supplied (elided repeat) — also in the text
 *   ' - '                untranslated (e.g. the object marker אֵת)
 *   ' . . . '            rendered together with a neighbouring word
 *   ' vvv '              rendering moved to another row
 *   '<p class=|..|>'     embedded paragraph markup (stripped)
 *
 * Output tables (in their own db for M0; merged into bible-study.db at the
 * next data release):
 *   bsb_words(verse_id, src_idx, lang, strongs, word_num, eng_start, eng_end, kind, match)
 *   bsb_supplied(verse_id, eng_start, eng_end, src_idx)
 *   bsb_renderings(strongs, rendering, count)
 *   bsb_headings(verse_id, seq, text)
 *   bsb_paragraphs(verse_id, eng_offset, style)
 */
import type Database from 'better-sqlite3';
import * as fs from 'node:fs';
import { parseRef, RefError } from '@divine-creative-ministries/bible-core/refparse';

export const ALIGN_SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE bsb_words (
  verse_id  INTEGER NOT NULL,          -- spine id of the BSB verse
  src_idx   INTEGER NOT NULL,          -- 1-based original-language order within the verse
  lang      TEXT NOT NULL,             -- 'H' | 'A' | 'G'
  strongs   TEXT,                      -- 'H7225' / 'G3306' (numeric, no suffix)
  word_num  INTEGER,                   -- our words.word_num (NULL = unmatched)
  word_verse_id INTEGER,               -- our words.verse_id (differs for Psalm titles: verse 0)
  eng_start INTEGER,                   -- char offsets into core BSB verse text (UTF-16)
  eng_end   INTEGER,
  kind      TEXT NOT NULL CHECK (kind IN ('span','untranslated','merged','unlocated')),
  match     TEXT NOT NULL CHECK (match IN ('strongs','position','reorder','edition','none')),
  PRIMARY KEY (verse_id, src_idx)
) WITHOUT ROWID;
CREATE TABLE bsb_supplied (
  verse_id  INTEGER NOT NULL,
  eng_start INTEGER NOT NULL,
  eng_end   INTEGER NOT NULL,
  src_idx   INTEGER,                   -- the original word whose rendering carried it
  PRIMARY KEY (verse_id, eng_start)
) WITHOUT ROWID;
CREATE TABLE bsb_renderings (
  strongs   TEXT NOT NULL,
  rendering TEXT NOT NULL,
  count     INTEGER NOT NULL,
  PRIMARY KEY (strongs, rendering)
) WITHOUT ROWID;
CREATE TABLE bsb_headings (
  verse_id INTEGER NOT NULL,
  seq      INTEGER NOT NULL,
  text     TEXT NOT NULL,
  PRIMARY KEY (verse_id, seq)
) WITHOUT ROWID;
CREATE TABLE bsb_paragraphs (
  verse_id   INTEGER NOT NULL,
  eng_offset INTEGER NOT NULL,
  style      TEXT NOT NULL,            -- 'p' prose | 'q1'/'q2' poetry indent | 'b' break
  PRIMARY KEY (verse_id, eng_offset)
) WITHOUT ROWID;
`;

const COL = { hebSort: 0, grkSort: 1, bsbSort: 2, verse: 3, lang: 4, orig: 5, strHeb: 10, strGrk: 11, verseId: 12, hdg: 13, par: 15, bsb: 18 };

interface Row {
  hebSort: number;
  grkSort: number;
  lang: 'H' | 'A' | 'G';
  strongs: number | null;
  bsb: string;
  hdg: string;
  par: string;
}

interface Tok {
  norm: string;
  start: number;
  end: number;
}

const TOKEN_RE = /[\p{L}\p{N}][\p{L}\p{N}’'\-]*/gu;
const normTok = (s: string): string => s.toLowerCase().replace(/’/g, "'").replace(/'+$/, '');

export function tokenize(text: string): Tok[] {
  const out: Tok[] = [];
  for (const m of text.matchAll(TOKEN_RE)) {
    out.push({ norm: normTok(m[0]), start: m.index!, end: m.index! + m[0].length });
  }
  return out;
}

/** Split a rendering into plain and supplied segments. */
export function segments(rendering: string): Array<{ text: string; supplied: boolean }> {
  const s = rendering.replace(/<[^>]*>/g, ' ').replace(/\.\.\./g, ' ').replace(/\s+/g, ' ');
  const out: Array<{ text: string; supplied: boolean }> = [];
  const re = /\[([^\]]*)\]|\{([^}]*)\}|([^[{]+)/g;
  for (const m of s.matchAll(re)) {
    const supplied = m[1] !== undefined || m[2] !== undefined;
    const text = (m[1] ?? m[2] ?? m[3] ?? '').trim();
    if (text) out.push({ text, supplied });
  }
  return out;
}

const stripTags = (s: string): string =>
  s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

function parStyle(par: string): string | null {
  const m = par.match(/class=\|([a-z0-9]+)\|/);
  if (!m) return null;
  const c = m[1]!;
  if (c === 'reg' || c === 'cont') return 'p';
  if (c === 'indent1' || c === 'indent1stline') return 'q1';
  if (c.startsWith('indent')) return 'q2';
  return 'p';
}

export interface AlignStats {
  verses: number;
  versesUnparsed: number;
  versesMissingText: number;
  words: { H: number; G: number; matched: { H: number; G: number }; byMatch: Record<string, number> };
  kinds: Record<string, number>;
  rebuild: { verses: number; exact: number };
}

export function stageAlignment(opts: {
  tsvPath: string;
  core: Database.Database;
  study: Database.Database;
  out: Database.Database;
}): AlignStats {
  const { core, study, out } = opts;
  out.exec(ALIGN_SCHEMA);

  const bsbText = new Map<number, string>();
  for (const r of core.prepare(`SELECT verse_id, text FROM verse_texts WHERE translation_id='BSB'`).iterate() as Iterable<{ verse_id: number; text: string }>) {
    bsbText.set(r.verse_id, r.text);
  }

  // our words: per verse, distinct word slots in source order with their Strong's numbers
  interface Slot { verseId: number; wordNum: number; strongs: Set<number>; isDefault: boolean }
  const slots = new Map<number, Slot[]>();
  const wq = study.prepare(
    `SELECT verse_id, word_num, strongs_num, is_default FROM words ORDER BY verse_id, word_num, part_num`,
  );
  for (const r of wq.iterate() as Iterable<{ verse_id: number; word_num: number; strongs_num: number | null; is_default: number }>) {
    let list = slots.get(r.verse_id);
    if (!list) slots.set(r.verse_id, (list = []));
    let last = list[list.length - 1];
    if (!last || last.wordNum !== r.word_num) {
      last = { verseId: r.verse_id, wordNum: r.word_num, strongs: new Set(), isDefault: r.is_default === 1 };
      list.push(last);
    }
    if (r.is_default === 1) last.isDefault = true;
    if (r.strongs_num != null) last.strongs.add(r.strongs_num);
  }

  const insWord = out.prepare(`INSERT INTO bsb_words VALUES (?,?,?,?,?,?,?,?,?,?)`);
  const insSup = out.prepare(`INSERT OR IGNORE INTO bsb_supplied VALUES (?,?,?,?)`);
  const insHdg = out.prepare(`INSERT OR IGNORE INTO bsb_headings VALUES (?,?,?)`);
  const insPar = out.prepare(`INSERT OR IGNORE INTO bsb_paragraphs VALUES (?,?,?)`);
  const renderings = new Map<string, number>();

  const stats: AlignStats = {
    verses: 0,
    versesUnparsed: 0,
    versesMissingText: 0,
    words: { H: 0, G: 0, matched: { H: 0, G: 0 }, byMatch: {} },
    kinds: {},
    rebuild: { verses: 0, exact: 0 },
  };

  const flush = (verseRef: string, rows: Row[], verseHdg: string): void => {
    if (rows.length === 0) return;
    let verseId: number;
    try {
      const p = parseRef(verseRef);
      if (p.kind !== 'verse') throw new RefError('not a verse');
      verseId = p.start;
    } catch {
      stats.versesUnparsed++;
      return;
    }
    stats.verses++;
    const text = bsbText.get(verseId);
    if (text === undefined) {
      stats.versesMissingText++;
      return;
    }
    const toks = tokenize(text);
    const covered = new Uint8Array(toks.length);
    let cursor = 0;

    const find = (segToks: string[]): number => {
      const n = segToks.length;
      const tryAt = (p: number): boolean => {
        for (let k = 0; k < n; k++) if (toks[p + k]?.norm !== segToks[k] || covered[p + k]) return false;
        return true;
      };
      for (let p = cursor; p + n <= toks.length; p++) if (tryAt(p)) return p;
      for (let p = 0; p < cursor && p + n <= toks.length; p++) if (tryAt(p)) return p;
      return -1;
    };

    // English pass (BSB order): spans per original word
    const orderKey = (r: Row) => (r.lang === 'G' ? r.grkSort : r.hebSort);
    const srcOrder = [...rows].sort((a, b) => orderKey(a) - orderKey(b));
    const srcIdx = new Map<Row, number>(srcOrder.map((r, i) => [r, i + 1]));
    const spanOf = new Map<Row, { start: number; end: number } | null>();
    const kindOf = new Map<Row, string>();

    // headings come from the verse's first TSV row even if that row carried no word
    const hdg = verseHdg || rows[0]!.hdg;
    if (hdg) hdg.split(/<p class=\|hdg\|>/).map(stripTags).filter(Boolean).forEach((h, seq) => insHdg.run(verseId, seq, h));
    rows.forEach((r, i) => {
      const raw = r.bsb.trim();
      if (raw === '-' || raw === '') {
        kindOf.set(r, 'untranslated');
        spanOf.set(r, null);
        return;
      }
      if (raw === '. . .' || raw === 'vvv' || raw === '...') {
        kindOf.set(r, 'merged');
        spanOf.set(r, null);
        return;
      }
      let start = -1;
      let end = -1;
      let plainText: string[] = [];
      let located = false;
      for (const seg of segments(raw)) {
        const segToks = tokenize(seg.text).map((t) => t.norm);
        if (segToks.length === 0) continue;
        const p = find(segToks);
        if (p < 0) continue;
        located = true;
        const s = toks[p]!.start;
        const e = toks[p + segToks.length - 1]!.end;
        for (let k = 0; k < segToks.length; k++) covered[p + k] = 1;
        cursor = p + segToks.length;
        if (seg.supplied) {
          insSup.run(verseId, s, e, srcIdx.get(r)!);
        } else {
          if (start < 0 || s < start) start = s;
          if (e > end) end = e;
          plainText.push(text.slice(s, e));
        }
      }
      // a paragraph mark belongs where this row's English starts; the first row
      // marks the verse start. Marks on rows whose English we couldn't place are
      // skipped rather than misplaced at offset 0.
      if (r.par && parStyle(r.par) && (i === 0 || start >= 0)) {
        insPar.run(verseId, i === 0 ? 0 : start, parStyle(r.par)!);
      }
      if (!located) {
        kindOf.set(r, 'unlocated');
        spanOf.set(r, null);
        return;
      }
      if (start < 0) {
        // only supplied words located: treat as merged (the word itself carries no English)
        kindOf.set(r, 'merged');
        spanOf.set(r, null);
        return;
      }
      kindOf.set(r, 'span');
      spanOf.set(r, { start, end });
      if (r.strongs != null) {
        const key = `${r.lang === 'G' ? 'G' : 'H'}${r.strongs}\u0000${plainText.join(' … ').toLowerCase()}`;
        renderings.set(key, (renderings.get(key) ?? 0) + 1);
      }
    });

    // rebuild check: every English word token covered by a span or supplied segment
    stats.rebuild.verses++;
    if (covered.every((c) => c === 1)) stats.rebuild.exact++;

    // Original pass: match to our word slots by Strong's, in source order
    const { bookNum, chapter, verse } = { bookNum: Math.floor(verseId / 1e6), chapter: Math.floor((verseId % 1e6) / 1e3), verse: verseId % 1e3 };
    let mine = slots.get(verseId) ?? [];
    if (bookNum === 19 && verse === 1) {
      const title = slots.get(bookNum * 1e6 + chapter * 1e3);
      if (title) mine = [...title, ...mine];
    }
    const defaults = mine.filter((s) => s.isDefault);
    const others = mine.filter((s) => !s.isDefault);
    const used = new Set<Slot>();
    let mc = 0;
    const has = (s: Slot | undefined, n: number | null) => !!s && n != null && s.strongs.has(n);
    for (let ri = 0; ri < srcOrder.length; ri++) {
      const r = srcOrder[ri]!;
      const lang = r.lang;
      const statLang = lang === 'G' ? 'G' : 'H';
      stats.words[statLang]++;
      let hit: Slot | undefined;
      let match = 'none';
      if (r.strongs != null) {
        for (let k = mc; k < Math.min(defaults.length, mc + 6); k++) {
          const s = defaults[k]!;
          if (!used.has(s) && s.strongs.has(r.strongs)) {
            hit = s;
            match = 'strongs';
            mc = k + 1;
            break;
          }
        }
      }
      if (!hit) {
        // Positional fallback (Strong's numbering differs between sources, or
        // the table leaves the word untagged): take the next slot only when the
        // neighbourhood confirms it — the following original word matches the
        // slot after it, or both sequences end here.
        const slot = defaults[mc];
        const next = srcOrder[ri + 1];
        const confirmed =
          slot && !used.has(slot) &&
          ((next === undefined && mc === defaults.length - 1) || (next !== undefined && has(defaults[mc + 1], next.strongs)));
        if (confirmed) {
          hit = slot;
          match = 'position';
          mc += 1;
        }
      }
      if (!hit && r.strongs != null) {
        hit = defaults.find((s) => !used.has(s) && s.strongs.has(r.strongs!));
        if (hit) match = 'reorder';
        if (!hit) {
          hit = others.find((s) => !used.has(s) && s.strongs.has(r.strongs!));
          if (hit) match = 'edition';
        }
      }
      if (hit) {
        used.add(hit);
        stats.words.matched[statLang]++;
      }
      stats.words.byMatch[match] = (stats.words.byMatch[match] ?? 0) + 1;
      const kind = kindOf.get(r)!;
      stats.kinds[kind] = (stats.kinds[kind] ?? 0) + 1;
      const span = spanOf.get(r);
      insWord.run(
        verseId,
        srcIdx.get(r)!,
        lang,
        r.strongs != null ? `${statLang}${r.strongs}` : null,
        hit?.wordNum ?? null,
        hit?.verseId ?? null,
        span?.start ?? null,
        span?.end ?? null,
        kind,
        match,
      );
    }
  };

  const content = fs.readFileSync(opts.tsvPath, 'utf8');
  const lines = content.split(/\r?\n/);
  let curRef = '';
  let curHdg = '';
  let rows: Row[] = [];
  const tx = out.transaction(() => {
    for (let li = 1; li < lines.length; li++) {
      const c = lines[li]!.split('\t');
      if (c.length < 19) continue;
      if (c[COL.verseId]) {
        flush(curRef, rows, curHdg);
        curRef = c[COL.verseId]!.trim();
        curHdg = c[COL.hdg] ?? '';
        rows = [];
      }
      const langCell = c[COL.lang]!.trim();
      if (!c[COL.orig]!.trim() && !c[COL.bsb]!.trim()) continue;
      const lang = langCell === 'Greek' ? 'G' : langCell === 'Aramaic' ? 'A' : langCell === 'Hebrew' ? 'H' : null;
      if (!lang) continue;
      const strCell = (lang === 'G' ? c[COL.strGrk] : c[COL.strHeb])!.trim();
      const sn = parseInt(strCell, 10);
      rows.push({
        hebSort: parseInt(c[COL.hebSort]!, 10),
        grkSort: parseInt(c[COL.grkSort]!, 10),
        lang,
        strongs: Number.isFinite(sn) ? sn : null,
        bsb: c[COL.bsb] ?? '',
        hdg: c[COL.hdg] ?? '',
        par: c[COL.par] ?? '',
      });
    }
    flush(curRef, rows, curHdg);
    const insR = out.prepare(`INSERT INTO bsb_renderings VALUES (?,?,?)`);
    for (const [key, n] of renderings) {
      const [strongs, rendering] = key.split('\u0000') as [string, string];
      insR.run(strongs, rendering, n);
    }
  });
  tx();
  out.exec(`CREATE INDEX idx_bsbw_word ON bsb_words(word_verse_id, word_num);
            CREATE INDEX idx_bsbw_strongs ON bsb_words(strongs);`);
  return stats;
}

/** Invariant gate. Fails loudly; never loosen a threshold to make a build pass. */
export function verifyAlignment(db: Database.Database, stats: AlignStats, bsbText: (verseId: number) => string): string[] {
  const problems: string[] = [];
  const pct = (a: number, b: number) => (b === 0 ? 0 : (100 * a) / b);
  const heb = pct(stats.words.matched.H, stats.words.H);
  const grk = pct(stats.words.matched.G, stats.words.G);
  const rebuild = pct(stats.rebuild.exact, stats.rebuild.verses);
  if (stats.verses < 31000) problems.push(`only ${stats.verses} verses parsed (expected ~31,086)`);
  if (stats.versesUnparsed > 0) problems.push(`${stats.versesUnparsed} verse refs failed to parse`);
  if (heb < 99.5) problems.push(`Hebrew/Aramaic words linked ${heb.toFixed(2)}% < 99.5%`);
  if (grk < 96) problems.push(`Greek words linked ${grk.toFixed(2)}% < 96%`);
  if (rebuild < 99) problems.push(`BSB rebuild from spans ${rebuild.toFixed(2)}% < 99%`);

  // spans inside verse bounds and non-overlapping
  const bad = db
    .prepare(
      `SELECT COUNT(*) AS n FROM bsb_words a JOIN bsb_words b
         ON a.verse_id = b.verse_id AND a.src_idx < b.src_idx
        WHERE a.eng_start IS NOT NULL AND b.eng_start IS NOT NULL
          AND a.eng_start < b.eng_end AND b.eng_start < a.eng_end`,
    )
    .get() as { n: number };
  if (bad.n > 0) problems.push(`${bad.n} overlapping span pairs`);

  // fixtures: the span for this Strong's number reads exactly `phrase`
  const fx = (verseId: number, phrase: string, strongs: string) => {
    const text = bsbText(verseId);
    const rows = db
      .prepare(`SELECT eng_start, eng_end FROM bsb_words WHERE verse_id = ? AND strongs = ? AND kind = 'span'`)
      .all(verseId, strongs) as Array<{ eng_start: number; eng_end: number }>;
    const got = rows.map((r) => text.slice(r.eng_start, r.eng_end));
    if (!got.includes(phrase)) problems.push(`fixture ${verseId} ${strongs}: expected "${phrase}", got ${JSON.stringify(got)}`);
  };
  fx(1001001, 'In the beginning', 'H7225');
  fx(1001001, 'God', 'H430');
  fx(1001001, 'the heavens', 'H8064');
  fx(19023001, 'is my shepherd', 'H7462'); // BSB renders רֹעִי as one phrase
  fx(43003016, 'loved', 'G25');
  fx(43015004, 'Remain', 'G3306');
  const sup = db.prepare(`SELECT eng_start, eng_end FROM bsb_supplied WHERE verse_id = 43015004`).all() as Array<{ eng_start: number; eng_end: number }>;
  const supText = sup.map((r) => bsbText(43015004).slice(r.eng_start, r.eng_end));
  if (!supText.includes('will remain')) problems.push(`fixture John 15:4: expected supplied "will remain", got ${JSON.stringify(supText)}`);
  return problems;
}
