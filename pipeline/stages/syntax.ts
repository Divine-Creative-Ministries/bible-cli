/**
 * Syntax stage: MACULA lowfat treebanks -> bible-syntax.db (clauses + roles).
 *
 * Sources (pinned commits, fetched by a sparse git checkout into
 * .cache/raw/macula/{hebrew-git,greek-git}):
 *   - macula-hebrew WLC/lowfat  (CC BY 4.0, Biblica; base text WLC)
 *   - macula-greek SBLGNT/lowfat (CC BY 4.0, Biblica; base text SBLGNT, CC BY 4.0)
 *
 * Deliberately NOT ingested (licensing: "used with permission" only upstream):
 * SDBH semantic domains (@sdbh/@lexdomain/@coredomain/@contextualdomain) and
 * MARBLE senses (@ln/@domain). We ship role structure, lemmas, Strong's.
 *
 * Versification: MACULA refs are native-tradition (WLC follows MT numbering;
 * SBLGNT follows modern critical numbering). They are mapped onto the English
 * spine using the TAHOT/TAGNT alternate-reference columns (.cache/raw/stepbible),
 * the same source the words stage uses.
 *
 * Negation is tree-derived, not from a hardcoded lemma list: Hebrew/Aramaic
 * negators carry type="negative"; Greek negators carry a Robinson morph ending
 * in PRT-N. A clause containing a negator is marked negated, and its v/vc role
 * rows get negated=1.
 *
 * Speaker attribution: the lowfat trees at the pinned commits carry no
 * who-said data (zero who= attributes), so clauses.speaker stays NULL.
 */
import { XMLParser } from 'fast-xml-parser';
import type { Database } from 'better-sqlite3';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { lookupBook, makeVerseId } from '../../src/canon.js';
import { RAW, log, normalizeGreek, normalizeHebrew, parseStepRef, splitStrongs, stepRows } from '../lib.js';

export const KNOWN_ROLES = new Set(['s', 'v', 'vc', 'o', 'io', 'o2', 'p', 'pp', 'adv', 'aux']);

export interface MaculaRef {
  bookNum: number;
  chapter: number;
  verse: number;
  wordPos: number;
}

/** Parse a MACULA word ref like 'GEN 1:1!5' or 'JHN 3:16!2'. */
export function parseMaculaRef(ref: string): MaculaRef | undefined {
  const m = ref.match(/^([1-9A-Z]{3}) (\d+):(\d+)!(\d+)$/);
  if (!m) return undefined;
  const book = lookupBook(m[1]!);
  if (!book) return undefined;
  return { bookNum: book.bookNum, chapter: parseInt(m[2]!, 10), verse: parseInt(m[3]!, 10), wordPos: parseInt(m[4]!, 10) };
}

/**
 * Parse a MACULA Strong's attribute into the repo's normalized form.
 * Hebrew @strongnumberx: '7225', '0871a'; rare multi-word values '1886a|0725'
 * keep only the first component. Greek @strong: '1722'; rare crasis compounds
 * '1537+4053' keep only the first component.
 */
export function parseMaculaStrongs(
  raw: string | undefined,
  lang: 'H' | 'G',
): { strongs: string; num: number; compound: boolean } | undefined {
  if (!raw) return undefined;
  const first = raw.split(/[|+]/)[0]!.trim();
  const st = splitStrongs(`${lang}${first}`);
  if (!st) return undefined;
  return { strongs: st.strongs, num: st.num, compound: raw !== first };
}

/** Role attribute -> canonical role code; undefined = no/invalid role. */
export function normalizeRole(role: string | undefined): string | undefined {
  if (!role) return undefined;
  return KNOWN_ROLES.has(role) ? role : undefined;
}

// ---- lowfat XML walking ----

interface XNode {
  tag: string;
  attrs: Record<string, string>;
  kids: XNode[];
  text: string;
}

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '',
  ignoreDeclaration: true,
  ignorePiTags: true,
  trimValues: false,
  maxNestedTags: 4096, // deeply nested clause trees exceed the default of 100
});

/** Convert fast-xml-parser preserveOrder output into a plain tree. */
function toTree(nodes: unknown[]): XNode[] {
  const out: XNode[] = [];
  for (const n of nodes as Array<Record<string, unknown>>) {
    const tag = Object.keys(n).find((k) => k !== ':@');
    if (!tag) continue;
    if (tag === '#text') continue;
    const attrs = (n[':@'] ?? {}) as Record<string, string>;
    const rawKids = (n[tag] ?? []) as unknown[];
    let text = '';
    for (const k of rawKids as Array<Record<string, unknown>>) {
      if (typeof k['#text'] === 'string' || typeof k['#text'] === 'number') text += String(k['#text']);
    }
    out.push({ tag, attrs, kids: toTree(rawKids), text });
  }
  return out;
}

interface ClauseRec {
  id: number;
  parent: number | null;
  lang: string | null;
  kind: string | null;
  rule: string | null;
  negated: boolean;
  vs: number; // min spine verse id
  ve: number; // max spine verse id
}

interface RoleRow {
  clauseId: number;
  role: string;
  verseId: number;
  wordPos: number;
  surface: string;
  lemma: string | null;
  lemmaNorm: string | null;
  strongs: string | null;
  strongsNum: number | null;
}

interface Stats {
  errors: Map<string, number>;
  compounds: number;
  errRoles: number;
  unmappedVerses: Set<string>;
  clausesOut: number;
  rolesOut: number;
}

function note(st: Stats, key: string): void {
  st.errors.set(key, (st.errors.get(key) ?? 0) + 1);
}

/**
 * Walk one lowfat file's tree, emitting clause and role rows.
 * `tradition` selects the versification map ('H' for WLC/MT, 'G' for SBLGNT).
 */
function walkFile(
  roots: XNode[],
  tradition: 'H' | 'G',
  resolveVerse: (tradition: 'H' | 'G', bookNum: number, chapter: number, verse: number) => number | undefined,
  nextClauseId: { n: number },
  clauses: ClauseRec[],
  roles: RoleRow[],
  st: Stats,
): void {
  const stack: ClauseRec[] = [];

  const visit = (node: XNode, slotRole: string | undefined): void => {
    if (node.tag === 'p' || node.tag === 'milestone') return; // plain-text rendering of the sentence
    if (node.tag === 'w') {
      const clause = stack[stack.length - 1];
      const ref = node.attrs['ref'] ? parseMaculaRef(node.attrs['ref']) : undefined;
      const surface = node.text.trim();
      if (!ref) {
        if (surface) note(st, `badref:${node.attrs['ref'] ?? '(missing)'}`);
        return;
      }
      const verseId = resolveVerse(tradition, ref.bookNum, ref.chapter, ref.verse);
      if (verseId === undefined) {
        st.unmappedVerses.add(`${tradition}:${ref.bookNum}:${ref.chapter}:${ref.verse}`);
        return;
      }
      // Negator? (tree-marked: Hebrew type="negative", Greek morph ...PRT-N)
      const isNegator =
        tradition === 'H' ? node.attrs['type'] === 'negative' : (node.attrs['morph'] ?? '').endsWith('PRT-N');
      if (isNegator && clause) clause.negated = true;

      for (const c of stack) {
        if (verseId < c.vs) c.vs = verseId;
        if (verseId > c.ve) c.ve = verseId;
        if (c.lang === null) c.lang = tradition === 'G' ? 'G' : (node.attrs['lang'] ?? 'H');
      }

      const ownRole = node.attrs['role'];
      if (ownRole && !normalizeRole(ownRole)) {
        st.errRoles++;
        note(st, `role:${ownRole.slice(0, 40)}`);
      }
      const role = normalizeRole(ownRole) ?? slotRole;
      if (!clause || !role) return;
      if (!surface) return; // elided/empty word node

      const lang = tradition === 'G' ? 'G' : ((node.attrs['lang'] ?? 'H') as 'H' | 'A');
      const strongsRaw = tradition === 'G' ? node.attrs['strong'] : node.attrs['strongnumberx'];
      const stg = parseMaculaStrongs(strongsRaw, tradition === 'G' ? 'G' : 'H');
      if (strongsRaw && !stg) note(st, `strongs:${strongsRaw.slice(0, 20)}`);
      if (stg?.compound) st.compounds++;
      const lemma = node.attrs['lemma'] ?? null;
      roles.push({
        clauseId: clause.id,
        role,
        verseId,
        wordPos: ref.wordPos,
        surface,
        lemma,
        lemmaNorm: lemma ? (lang === 'G' ? normalizeGreek(lemma) : normalizeHebrew(lemma)) : null,
        strongs: stg?.strongs ?? null,
        strongsNum: stg?.num ?? null,
      });
      st.rolesOut++;
      return;
    }
    if (node.tag === 'wg') {
      const isClause = node.attrs['class'] === 'cl';
      let nextSlot = slotRole;
      if (isClause) {
        const parent = stack[stack.length - 1];
        const rec: ClauseRec = {
          id: nextClauseId.n++,
          parent: parent ? parent.id : null,
          lang: null,
          kind: node.attrs['clauseType'] ?? node.attrs['clausetype'] ?? null,
          rule: node.attrs['rule'] ?? node.attrs['Rule'] ?? null,
          negated: false,
          vs: Number.MAX_SAFE_INTEGER,
          ve: 0,
        };
        clauses.push(rec);
        st.clausesOut++;
        stack.push(rec);
        // A clause fills its parent's role slot as a whole; its words belong
        // to its own roles, so the inherited slot role does not propagate in.
        for (const kid of node.kids) visit(kid, undefined);
        stack.pop();
        return;
      }
      const wgRole = node.attrs['role'];
      if (wgRole) {
        const norm = normalizeRole(wgRole);
        if (norm) nextSlot = norm;
        else {
          st.errRoles++;
          note(st, `role:${wgRole.slice(0, 40)}`);
        }
      }
      for (const kid of node.kids) visit(kid, nextSlot);
      return;
    }
    // book / chapter / sentence / error wrappers: descend
    for (const kid of node.kids) visit(kid, slotRole);
  };

  for (const root of roots) visit(root, undefined);
}

// ---- versification: native tradition -> spine ----

/**
 * Build (tradition, book, chapter, verse) -> spine verse id from the
 * TAHOT/TAGNT alternate-ref columns, mirroring stages/words.ts spine logic.
 */
function buildVerseResolver(core: Database): (tradition: 'H' | 'G', b: number, c: number, v: number) => number | undefined {
  const spine = new Set<number>(
    (core.prepare('SELECT verse_id FROM verses').all() as Array<{ verse_id: number }>).map((r) => r.verse_id),
  );
  const map = new Map<string, number>();

  for (const file of ['TAHOT-1.txt', 'TAHOT-2.txt', 'TAHOT-3.txt', 'TAHOT-4.txt']) {
    for (const cells of stepRows(path.join(RAW, 'stepbible', file), /^[1-9A-Za-z]+\.\d+\.\d+/)) {
      const ref = parseStepRef(cells[0]!);
      if (!ref?.native) continue;
      map.set(`H:${ref.native.bookNum}:${ref.native.chapter}:${ref.native.verse}`, ref.verseId);
    }
  }
  for (const file of ['TAGNT-1.txt', 'TAGNT-2.txt']) {
    for (const cells of stepRows(path.join(RAW, 'stepbible', file), /^[1-9A-Za-z]+\.\d+\.\d+/)) {
      const ref = parseStepRef(cells[0]!);
      if (!ref?.native) continue;
      // TAGNT main ref = modern critical (SBLGNT-style) numbering; when it is
      // off-spine, the bracketed KJV ref is where the spine keeps that verse.
      if (!spine.has(ref.verseId)) {
        const spineId = makeVerseId(ref.native.bookNum, ref.native.chapter, ref.native.verse);
        map.set(`G:${Math.floor(ref.verseId / 1_000_000)}:${Math.floor((ref.verseId % 1_000_000) / 1_000)}:${ref.verseId % 1_000}`, spineId);
      }
    }
  }

  return (tradition, b, c, v) => {
    const mapped = map.get(`${tradition}:${b}:${c}:${v}`);
    if (mapped !== undefined) return mapped;
    const direct = makeVerseId(b, c, v);
    return spine.has(direct) ? direct : undefined;
  };
}

// ---- stage ----

export function stageSyntax(db: Database, core: Database): void {
  const resolveVerse = buildVerseResolver(core);
  const hebDir = path.join(RAW, 'macula', 'hebrew-git', 'WLC', 'lowfat');
  const grkDir = path.join(RAW, 'macula', 'greek-git', 'SBLGNT', 'lowfat');
  for (const d of [hebDir, grkDir]) {
    if (!fs.existsSync(d)) {
      throw new Error(`MACULA lowfat directory missing: ${d} — fetch the pinned sparse checkouts first (see pipeline/build-syntax.ts header).`);
    }
  }

  const insClause = db.prepare(
    'INSERT INTO clauses (clause_id, verse_start, verse_end, lang, kind, rule, parent_clause_id, negated, speaker) VALUES (?,?,?,?,?,?,?,?,NULL)',
  );
  const insRole = db.prepare(
    'INSERT INTO clause_roles (clause_id, role, verse_id, word_pos, surface, lemma, lemma_norm, strongs, strongs_num, negated) VALUES (?,?,?,?,?,?,?,?,?,0)',
  );

  const st: Stats = { errors: new Map(), compounds: 0, errRoles: 0, unmappedVerses: new Set(), clausesOut: 0, rolesOut: 0 };
  const nextClauseId = { n: 1 };

  const ingestDir = (dir: string, tradition: 'H' | 'G', filePattern: RegExp): void => {
    const files = fs.readdirSync(dir).filter((f) => filePattern.test(f)).sort();
    if (files.length === 0) throw new Error(`no lowfat XML files in ${dir}`);
    db.transaction(() => {
      for (const f of files) {
        const roots = toTree(parser.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as unknown[]);
        const clauses: ClauseRec[] = [];
        const roles: RoleRow[] = [];
        walkFile(roots, tradition, resolveVerse, nextClauseId, clauses, roles, st);
        for (const c of clauses) {
          if (c.vs === Number.MAX_SAFE_INTEGER) continue; // clause with no mappable words
          insClause.run(c.id, c.vs, c.ve, c.lang ?? (tradition === 'G' ? 'G' : 'H'), c.kind, c.rule, c.parent, c.negated ? 1 : 0);
        }
        const kept = new Set(clauses.filter((c) => c.vs !== Number.MAX_SAFE_INTEGER).map((c) => c.id));
        for (const r of roles) {
          if (!kept.has(r.clauseId)) continue;
          insRole.run(r.clauseId, r.role, r.verseId, r.wordPos, r.surface, r.lemma, r.lemmaNorm, r.strongs, r.strongsNum);
        }
      }
    })();
    log(`${tradition === 'H' ? 'Hebrew (WLC)' : 'Greek (SBLGNT)'}: ${files.length} files ingested`);
  };

  ingestDir(hebDir, 'H', /^\d+-.*-lowfat\.xml$/);
  ingestDir(grkDir, 'G', /^\d+-[a-z0-9]+\.xml$/);

  // Propagate clause negation onto verb rows.
  db.exec(`UPDATE clause_roles SET negated = 1
           WHERE role IN ('v','vc')
             AND clause_id IN (SELECT clause_id FROM clauses WHERE negated = 1)`);

  // ---- loud failure on data problems ----
  if (st.errors.size > 0) {
    const entries = [...st.errors.entries()].sort((a, z) => z[1] - a[1]);
    const total = entries.reduce((s, [, n]) => s + n, 0);
    log(`MACULA WARNINGS (${total} rows affected):`);
    for (const [k, n] of entries.slice(0, 20)) log(`  ${n}x ${k}`);
  }
  // The pinned macula-greek commit contains exactly 6 wg nodes whose role is an
  // upstream error string ('err__subordinated simple cl.,...'); tolerate those
  // known defects but nothing more.
  if (st.errRoles > 10) {
    throw new Error(`syntax: ${st.errRoles} unparseable role codes — inspect before shipping`);
  }
  if (st.unmappedVerses.size > 0) {
    log(`unmapped native verses (${st.unmappedVerses.size}): ${[...st.unmappedVerses].slice(0, 10).join(', ')}${st.unmappedVerses.size > 10 ? ' …' : ''}`);
  }
  if (st.unmappedVerses.size > 20) {
    throw new Error(`syntax: ${st.unmappedVerses.size} native verses could not be mapped to the spine — versification mapping is broken`);
  }
  if (st.compounds > 50) {
    throw new Error(`syntax: unexpectedly many compound Strong's values (${st.compounds}) — format change upstream?`);
  }
  log(`clauses: ${st.clausesOut}, role rows: ${st.rolesOut}, negated-clause verb rows updated`);
}

export function verifySyntax(db: Database, core: Database): void {
  const one = <T>(sql: string, ...args: unknown[]): T => db.prepare(sql).get(...args) as T;
  const assert = (cond: boolean, msg: string): void => {
    if (!cond) throw new Error(`syntax verify failed: ${msg}`);
  };

  const roles = (db.prepare('SELECT DISTINCT role FROM clause_roles').all() as Array<{ role: string }>).map((r) => r.role);
  for (const r of roles) assert(KNOWN_ROLES.has(r), `unknown role '${r}' in clause_roles`);

  const nClauses = one<{ n: number }>('SELECT COUNT(*) n FROM clauses').n;
  const nRoles = one<{ n: number }>('SELECT COUNT(*) n FROM clause_roles').n;
  assert(nClauses > 120_000, `too few clauses (${nClauses})`);
  assert(nRoles > 400_000, `too few role rows (${nRoles})`);

  // Coverage: nearly every spine verse should be touched by at least one clause.
  const cov = (lo: number, hi: number, label: string, min: number): void => {
    const spine = (core.prepare('SELECT COUNT(*) n FROM verses WHERE verse_id BETWEEN ? AND ?').get(lo, hi) as { n: number }).n;
    const covered = one<{ n: number }>('SELECT COUNT(DISTINCT verse_id) n FROM clause_roles WHERE verse_id BETWEEN ? AND ?', lo, hi).n;
    const ratio = covered / spine;
    log(`coverage ${label}: ${covered}/${spine} verses (${(ratio * 100).toFixed(1)}%)`);
    assert(ratio >= min, `${label} clause coverage ${(ratio * 100).toFixed(1)}% < ${min * 100}%`);
  };
  cov(1_000_000, 39_999_999, 'OT', 0.95);
  cov(40_000_000, 66_999_999, 'NT', 0.95);

  // Fixtures: known clause structures must be present and queryable.
  const clauseWith = (verb: number, subj: number | null, verseLo: number, verseHi: number, negated = false): number => {
    const row = db
      .prepare(
        `SELECT c.clause_id n FROM clauses c
         WHERE c.verse_start BETWEEN ? AND ?
           AND EXISTS (SELECT 1 FROM clause_roles r WHERE r.clause_id = c.clause_id AND r.role IN ('v','vc') AND r.strongs_num = ? ${negated ? 'AND r.negated = 1' : ''})
           ${subj === null ? '' : "AND EXISTS (SELECT 1 FROM clause_roles r WHERE r.clause_id = c.clause_id AND r.role = 's' AND r.strongs_num = ?)"}
         LIMIT 1`,
      )
      .get(...(subj === null ? [verseLo, verseHi, verb] : [verseLo, verseHi, verb, subj])) as { n: number } | undefined;
    return row?.n ?? 0;
  };
  assert(clauseWith(1254, 430, 1_001_001, 1_001_001) > 0, 'Gen 1:1 "God created" clause missing');
  assert(clauseWith(2142, 430, 1_008_001, 1_008_001) > 0, 'Gen 8:1 "God remembered" clause missing');
  assert(clauseWith(2142, 430, 2_002_024, 2_002_024) > 0, 'Exod 2:24 "God remembered" clause missing');
  assert(clauseWith(4100, null, 43_003_018, 43_003_018, true) > 0, 'John 3:18 negated "believe" clause missing');

  const negated = one<{ n: number }>('SELECT COUNT(*) n FROM clauses WHERE negated = 1').n;
  assert(negated > 3_000, `too few negated clauses (${negated})`);

  log(`verify ok: ${nClauses} clauses, ${nRoles} role rows, ${negated} negated clauses`);
}
