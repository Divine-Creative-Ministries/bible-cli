import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ChapterText } from '../src/commands/reading.js';
import {
  addNote,
  advanceCursor,
  chapterUnits,
  chunkUnits,
  coverage,
  createSession,
  defaultSession,
  deleteSession,
  findRecurrences,
  gotoUnit,
  listSessions,
  loadSession,
  logRead,
  notesThrough,
  resolveNote,
  resolveScope,
  saveSession,
  sessionExists,
  slugify,
  StudyError,
  type LemmaSource,
  type StudySession,
} from '../src/study/session.js';

const mkSession = (over: Partial<Parameters<typeof createSession>[0]> = {}): StudySession =>
  createSession({
    name: 'genesis',
    scopeInput: 'Genesis',
    ranges: resolveScope('Genesis'),
    translation: 'BSB',
    unit: 'chapter',
    bare: false,
    units: chapterUnits(resolveScope('Genesis')),
    ...over,
  });

describe('resolveScope', () => {
  it("resolves 'bible' to the whole canon", () => {
    const r = resolveScope('bible');
    expect(r).toEqual([{ start: 1_000_000, end: 66_999_999, label: 'Bible' }]);
  });
  it('resolves testaments and book ranges', () => {
    expect(resolveScope('ot')[0]).toMatchObject({ start: 1_000_000, end: 39_999_999 });
    expect(resolveScope('nt')[0]).toMatchObject({ start: 40_000_000, end: 66_999_999 });
    expect(resolveScope('Gen-Deu')[0]).toMatchObject({ start: 1_000_000, end: 5_999_999 });
  });
  it('falls through to plain references', () => {
    expect(resolveScope('Isaiah 40-55')[0]).toMatchObject({ start: 23_040_000, end: 23_055_999 });
  });
});

describe('chapterUnits', () => {
  it('builds one unit per chapter of a book', () => {
    const units = chapterUnits(resolveScope('Genesis'));
    expect(units).toHaveLength(50);
    expect(units[0]).toEqual({ label: 'Genesis 1', start: 1_001_000, end: 1_001_999 });
    expect(units[49]).toEqual({ label: 'Genesis 50', start: 1_050_000, end: 1_050_999 });
  });
  it("builds 1189 units for 'bible'", () => {
    expect(chapterUnits(resolveScope('bible'))).toHaveLength(1189);
  });
  it('spans book ranges in canon order', () => {
    const units = chapterUnits(resolveScope('Gen-Exo'));
    expect(units).toHaveLength(90);
    expect(units[50]!.label).toBe('Exodus 1');
  });
  it('clamps partial-chapter scopes to the scope bounds', () => {
    const units = chapterUnits(resolveScope('Genesis 12-25'));
    expect(units).toHaveLength(14);
    expect(units[0]).toMatchObject({ label: 'Genesis 12', start: 1_012_000 });
    expect(units[13]).toMatchObject({ label: 'Genesis 25', end: 1_025_999 });
  });
});

describe('chunkUnits', () => {
  const fakeLoader =
    (chaptersPerBook: Record<number, number>, chars: number) =>
    (start: number, end: number): ChapterText[] => {
      const out: ChapterText[] = [];
      for (const [bookStr, n] of Object.entries(chaptersPerBook)) {
        const book = Number(bookStr);
        for (let c = 1; c <= n; c++) {
          const id = book * 1_000_000 + c * 1_000;
          if (id + 999 < start || id > end) continue;
          out.push({ bookNum: book, chapter: c, text: 'x'.repeat(chars), chars });
        }
      }
      return out;
    };

  it('packs chapters into character-budgeted units', () => {
    const units = chunkUnits(resolveScope('Genesis'), fakeLoader({ 1: 50 }, 1000), 3000);
    expect(units).toHaveLength(17); // 50 chapters, 3 per chunk
    expect(units[0]).toEqual({ label: 'Genesis 1–3', start: 1_001_000, end: 1_003_999 });
    expect(units[16]).toEqual({ label: 'Genesis 49–50', start: 1_049_000, end: 1_050_999 });
  });
  it('never lets a unit span book boundaries', () => {
    const units = chunkUnits(resolveScope('Gen-Exo'), fakeLoader({ 1: 2, 2: 2 }, 100), 100_000);
    expect(units.map((u) => u.label)).toEqual(['Genesis 1–2', 'Exodus 1–2']);
  });
});

describe('cursor', () => {
  it('advances through units and rejects reading past the end', () => {
    const s = mkSession({ units: chapterUnits(resolveScope('Ruth')) });
    expect(s.cursor).toBe(0);
    expect(advanceCursor(s, 1)).toBe(0);
    expect(advanceCursor(s, 1)).toBe(1);
    expect(advanceCursor(s, 1)).toBe(2);
    expect(advanceCursor(s, 1)).toBe(3);
    expect(() => advanceCursor(s, 1)).toThrow(StudyError);
  });
  it('prev re-shows the unit before the last-shown one and stops at the start', () => {
    const s = mkSession();
    expect(() => advanceCursor(s, -1)).toThrow(/beginning/);
    advanceCursor(s, 1); // showed 0
    expect(() => advanceCursor(s, -1)).toThrow(/beginning/);
    advanceCursor(s, 1); // showed 1
    expect(advanceCursor(s, -1)).toBe(0); // back to 0
    expect(advanceCursor(s, 1)).toBe(1); // forward again
  });
  it('goto moves the cursor to the unit containing a verse id', () => {
    const s = mkSession({ scopeInput: 'Gen-Exo', ranges: resolveScope('Gen-Exo'), units: chapterUnits(resolveScope('Gen-Exo')) });
    expect(gotoUnit(s, 2_003_004)).toBe(52); // Exodus 3:4
    expect(s.cursor).toBe(52);
    expect(advanceCursor(s, 1)).toBe(52); // next reads Exodus 3
    expect(() => gotoUnit(s, 40_001_001)).toThrow(/outside/);
  });
});

describe('notebook', () => {
  it('rejects notes with no verse anchors', () => {
    const s = mkSession();
    expect(() => addNote(s, { type: 'observation', text: 'floating summary', refs: [] })).toThrow(/anchored to exact verses/);
    expect(s.notes).toHaveLength(0);
  });
  it('rejects empty text and unknown types', () => {
    const s = mkSession();
    expect(() => addNote(s, { type: 'observation', text: '  ', refs: [1_001_001] })).toThrow(StudyError);
    expect(() => addNote(s, { type: 'insight' as never, text: 'x', refs: [1_001_001] })).toThrow(/Unknown note type/);
  });
  it('requires --against for counterexamples and links them without flipping status', () => {
    const s = mkSession();
    expect(() => addNote(s, { type: 'counterexample', text: 'but…', refs: [1_001_001] })).toThrow(/--against/);
    const pattern = addNote(s, { type: 'pattern', text: 'doubled names', refs: [1_022_011, 1_046_002] });
    expect(pattern.status).toBe('open');
    const counter = addNote(s, { type: 'counterexample', text: 'single call here', refs: [1_012_001], against: pattern.id });
    expect(counter.links).toEqual([pattern.id]);
    expect(pattern.status).toBe('open'); // only explicit resolve flips it
    expect(() => addNote(s, { type: 'observation', text: 'x', refs: [1_001_001], against: pattern.id })).toThrow(/only valid/);
    expect(() => addNote(s, { type: 'counterexample', text: 'x', refs: [1_001_001], against: 999 })).toThrow(/no such note/);
    // counterexamples test patterns, not other note types
    const obs = addNote(s, { type: 'observation', text: 'obs', refs: [1_001_001] });
    expect(() => addNote(s, { type: 'counterexample', text: 'x', refs: [1_001_002], against: obs.id })).toThrow(/counterexamples test patterns/);
  });
  it('stamps unit_ref from the read log, or marks pre-reading notes', () => {
    const s = mkSession();
    expect(addNote(s, { type: 'observation', text: 'early', refs: [1_022_011] }).unit_ref).toBe('(before reading)');
    logRead(s, advanceCursor(s, 1));
    expect(addNote(s, { type: 'observation', text: 'in situ', refs: [1_001_003] }).unit_ref).toBe('Genesis 1');
  });
  it('resolve sets pattern status explicitly, and only on patterns', () => {
    const s = mkSession();
    const p = addNote(s, { type: 'pattern', text: 'p', refs: [1_001_001] });
    const o = addNote(s, { type: 'observation', text: 'o', refs: [1_001_002] });
    expect(resolveNote(s, p.id, 'refuted').status).toBe('refuted');
    expect(() => resolveNote(s, o.id, 'refuted')).toThrow(/only patterns/);
    expect(() => resolveNote(s, p.id, 'maybe' as never)).toThrow(/Invalid status/);
    expect(() => resolveNote(s, 42, 'refuted')).toThrow(/No note/);
  });
  it('assigns sequential ids and sorted unique refs', () => {
    const s = mkSession();
    const a = addNote(s, { type: 'observation', text: 'a', refs: [1_002_003, 1_001_001, 1_002_003] });
    const b = addNote(s, { type: 'question', text: 'b', refs: [1_003_001] });
    expect(a.id).toBe(1);
    expect(b.id).toBe(2);
    expect(a.refs).toEqual([1_001_001, 1_002_003]);
  });
  it('groups notes through a verse position for review', () => {
    const s = mkSession();
    addNote(s, { type: 'observation', text: 'early', refs: [1_001_001] });
    addNote(s, { type: 'observation', text: 'late', refs: [1_040_001] });
    addNote(s, { type: 'question', text: 'q', refs: [1_002_005] });
    const g = notesThrough(s, 1_003_999);
    expect(g.get('observation')!.map((n) => n.text)).toEqual(['early']);
    expect(g.get('question')).toHaveLength(1);
    expect(g.get('pattern')).toHaveLength(0);
  });
});

describe('recurrences', () => {
  const src: LemmaSource = {
    distinctiveLemmas: (refs) => (refs.includes(1_022_011) ? ['אַבְרָהָם', 'מַלְאָךְ'] : ['ζωή']),
    unitLemmas: (start) => (start >= 2_003_000 ? new Set(['אַבְרָהָם', 'מַלְאָךְ', 'משֶׁה']) : new Set(['בְּרֵאשִׁית'])),
    locations: () => [2_003_002, 2_003_006],
  };
  const base = (): StudySession =>
    mkSession({ scopeInput: 'Gen-Exo', ranges: resolveScope('Gen-Exo'), units: chapterUnits(resolveScope('Gen-Exo')) });

  it('surfaces open patterns sharing >= 2 distinctive lemmas with the unit', () => {
    const s = base();
    addNote(s, { type: 'pattern', text: 'doubled name at divine call', refs: [1_022_011, 1_046_002] });
    const rec = findRecurrences(s, 52, src); // Exodus 3
    expect(rec).toHaveLength(1);
    expect(rec[0]).toMatchObject({ note_id: 1, note_type: 'pattern', lemmas: ['אַבְרָהָם', 'מַלְאָךְ'], at: [2_003_002, 2_003_006] });
    // lemma set cached in the session for later units
    expect(s.lemma_cache['1']).toEqual(['אַבְרָהָם', 'מַלְאָךְ']);
  });
  it('skips resolved patterns, non-candidate types, and notes anchored in the unit itself', () => {
    const s = base();
    const p = addNote(s, { type: 'pattern', text: 'p', refs: [1_022_011] });
    resolveNote(s, p.id, 'refuted');
    addNote(s, { type: 'observation', text: 'obs', refs: [1_022_011] });
    addNote(s, { type: 'pattern', text: 'anchored here', refs: [2_003_004] });
    expect(findRecurrences(s, 52, src)).toHaveLength(0);
  });
  it('requires at least two shared lemmas', () => {
    const s = base();
    addNote(s, { type: 'question', text: 'why life?', refs: [43_001_004] }); // distinctive: ζωή only
    expect(findRecurrences(s, 52, src)).toHaveLength(0);
  });
});

describe('coverage', () => {
  it('counts read/unread per book with gaps', () => {
    const s = mkSession({ scopeInput: 'Gen-Exo', ranges: resolveScope('Gen-Exo'), units: chapterUnits(resolveScope('Gen-Exo')) });
    for (const i of [0, 1, 2, 52]) logRead(s, i);
    logRead(s, 2); // re-reads count once
    const c = coverage(s);
    expect(c.units_total).toBe(90);
    expect(c.units_read).toBe(4);
    expect(c.percent).toBe(4);
    expect(c.books).toEqual([
      { book: 'Genesis', units: 50, read: 3 },
      { book: 'Exodus', units: 40, read: 1 },
    ]);
    expect(c.gaps).toEqual([
      { from: 'Genesis 4', to: 'Exodus 2', units: 49 },
      { from: 'Exodus 4', to: 'Exodus 40', units: 37 },
    ]);
  });
  it('reports notebook stats by type and pattern status', () => {
    const s = mkSession();
    addNote(s, { type: 'observation', text: 'o', refs: [1_001_001] });
    const p = addNote(s, { type: 'pattern', text: 'p', refs: [1_001_002] });
    addNote(s, { type: 'pattern', text: 'p2', refs: [1_001_003] });
    resolveNote(s, p.id, 'supported');
    const c = coverage(s);
    expect(c.notes.by_type).toEqual({ observation: 1, pattern: 2 });
    expect(c.notes.patterns_by_status).toEqual({ supported: 1, open: 1 });
  });
});

describe('persistence', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bible-study-test-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('slugifies names for filenames', () => {
    expect(slugify('Isaiah 40-55')).toBe('isaiah-40-55');
    expect(slugify('Gen-Exo')).toBe('gen-exo');
    expect(() => slugify('!!!')).toThrow(StudyError);
  });

  it('round-trips a session atomically and lists by recency', async () => {
    const a = mkSession();
    saveSession(a, dir);
    expect(sessionExists('genesis', dir)).toBe(true);
    expect(fs.readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toHaveLength(0);

    advanceCursor(a, 1);
    addNote(a, { type: 'observation', text: 'obs', refs: [1_001_001] });
    saveSession(a, dir);
    const loaded = loadSession('genesis', dir);
    expect(loaded.cursor).toBe(1);
    expect(loaded.notes).toHaveLength(1);
    expect(loaded.lemma_cache).toEqual({});

    await new Promise((r) => setTimeout(r, 5));
    const b = mkSession({ name: 'exodus', scopeInput: 'Exodus', ranges: resolveScope('Exodus'), units: chapterUnits(resolveScope('Exodus')) });
    saveSession(b, dir);
    expect(listSessions(dir).map((s) => s.name)).toEqual(['exodus', 'genesis']);
    expect(defaultSession(dir).name).toBe('exodus');
  });

  it('deletes by exact name and errors on unknowns', () => {
    saveSession(mkSession(), dir);
    expect(() => deleteSession('nope', dir)).toThrow(/No study session/);
    deleteSession('genesis', dir);
    expect(sessionExists('genesis', dir)).toBe(false);
    expect(() => loadSession('genesis', dir)).toThrow(/No study session/);
    expect(() => defaultSession(dir)).toThrow(/No study sessions yet/);
  });

  it('createSession rejects an empty unit list', () => {
    expect(() => mkSession({ units: [] })).toThrow(/no reading units/);
  });
});
