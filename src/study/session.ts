/**
 * Inductive reading sessions: durable state for the read-first workflow.
 * A session is a cursor over an ordered list of reading units (chapters or
 * character-sized chunks) plus a typed, evidence-anchored notebook.
 *
 * CRITICAL INVARIANT: every note is anchored to exact verse ids. A note with
 * no verse anchors is rejected — the notebook must never become free-floating
 * summaries detached from the text.
 *
 * This module is CLI-agnostic and database-free (callers inject verse/lemma
 * lookups), so the logic is unit-testable against a temp directory.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { byBookNum, makeVerseId, splitVerseId } from '../canon.js';
import { chunkChapters, type ChapterText } from '../commands/reading.js';
import { dataDir } from '../db/index.js';
import { parseScope } from '../refparse/index.js';

export type UnitKind = 'chapter' | 'chunk';
export type NoteType = 'observation' | 'question' | 'pattern' | 'counterexample' | 'conclusion';
export type NoteStatus = 'open' | 'supported' | 'refuted';
export const NOTE_TYPES: NoteType[] = ['observation', 'question', 'pattern', 'counterexample', 'conclusion'];
export const NOTE_STATUSES: NoteStatus[] = ['open', 'supported', 'refuted'];

export interface ScopeRange {
  start: number;
  end: number;
  label: string;
}

export interface Unit {
  label: string;
  start: number; // inclusive verse-id bounds
  end: number;
}

export interface StudyNote {
  id: number;
  type: NoteType;
  text: string;
  refs: number[]; // exact verse-id anchors — never empty
  unit_ref: string; // unit label current when the note was taken
  created: string;
  status?: NoteStatus; // patterns only
  links?: number[]; // note ids (counterexample --against)
}

export interface ReadLogEntry {
  unit: number; // unit index
  ref: string; // unit label
  ts: string;
}

export interface StudySession {
  name: string;
  scope: { input: string; ranges: ScopeRange[] };
  translation: string;
  unit: UnitKind;
  chunkSize?: number;
  /**
   * Persisted (not derived) so cursor/coverage semantics survive database or
   * chunking changes after the session starts.
   */
  units: Unit[];
  /** Index of the NEXT unit to read: `next` shows units[cursor], then advances. */
  cursor: number;
  created: string;
  updated: string;
  options: { bare: boolean };
  notes: StudyNote[];
  read_log: ReadLogEntry[];
  /** Per-note distinctive-lemma sets, computed lazily (notes are immutable). */
  lemma_cache: Record<string, string[]>;
}

export class StudyError extends Error {}

// ---------- scope + unit construction ----------

export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug) throw new StudyError(`Cannot derive a session name from '${name}'; pass --name.`);
  return slug;
}

/** Like parseScope, plus 'bible' for the whole canon. Throws RefError/StudyError. */
export function resolveScope(input: string): ScopeRange[] {
  if (input.trim().toLowerCase() === 'bible') {
    return [{ start: 1_000_000, end: 66_999_999, label: 'Bible' }];
  }
  return parseScope(input);
}

/** One unit per canon chapter intersecting the scope ranges. */
export function chapterUnits(ranges: ScopeRange[]): Unit[] {
  const units: Unit[] = [];
  for (const r of ranges) {
    const firstBook = Math.max(1, Math.floor(r.start / 1_000_000));
    const lastBook = Math.min(66, Math.floor(r.end / 1_000_000));
    for (let bn = firstBook; bn <= lastBook; bn++) {
      const book = byBookNum.get(bn);
      if (!book) continue;
      for (let ch = 1; ch <= book.chapters; ch++) {
        const start = makeVerseId(bn, ch, 0);
        const end = makeVerseId(bn, ch, 999);
        if (end < r.start || start > r.end) continue;
        units.push({
          label: `${book.name} ${ch}`,
          start: Math.max(start, r.start),
          end: Math.min(end, r.end),
        });
      }
    }
  }
  return units;
}

/**
 * Character-budgeted chunk units. Chapters are loaded via the injected loader
 * (the CLI passes reading.ts's loadChapters), grouped per book — units never
 * span book boundaries, which keeps labels and coverage per-book sane — and
 * packed with the same chunking used by `bible read`.
 */
export function chunkUnits(
  ranges: ScopeRange[],
  loader: (start: number, end: number) => ChapterText[],
  chunkSize: number,
): Unit[] {
  const units: Unit[] = [];
  for (const r of ranges) {
    const chapters = loader(r.start, r.end);
    const perBook: ChapterText[][] = [];
    for (const ch of chapters) {
      const last = perBook[perBook.length - 1];
      if (last && last[0]!.bookNum === ch.bookNum) last.push(ch);
      else perBook.push([ch]);
    }
    for (const group of perBook) {
      for (const chunk of chunkChapters(group, chunkSize)) {
        const first = chunk[0]!;
        const last = chunk[chunk.length - 1]!;
        const book = byBookNum.get(first.bookNum)!;
        units.push({
          label: first.chapter === last.chapter ? `${book.name} ${first.chapter}` : `${book.name} ${first.chapter}–${last.chapter}`,
          start: Math.max(makeVerseId(first.bookNum, first.chapter, 0), r.start),
          end: Math.min(makeVerseId(last.bookNum, last.chapter, 999), r.end),
        });
      }
    }
  }
  return units;
}

export interface CreateOptions {
  name: string;
  scopeInput: string;
  ranges: ScopeRange[];
  translation: string;
  unit: UnitKind;
  chunkSize?: number;
  bare: boolean;
  units: Unit[];
}

export function createSession(o: CreateOptions): StudySession {
  if (o.units.length === 0) throw new StudyError(`Scope '${o.scopeInput}' produced no reading units.`);
  const now = new Date().toISOString();
  return {
    name: o.name,
    scope: { input: o.scopeInput, ranges: o.ranges },
    translation: o.translation,
    unit: o.unit,
    ...(o.unit === 'chunk' ? { chunkSize: o.chunkSize } : {}),
    units: o.units,
    cursor: 0,
    created: now,
    updated: now,
    options: { bare: o.bare },
    notes: [],
    read_log: [],
    lemma_cache: {},
  };
}

// ---------- cursor ----------

/**
 * `next` returns the index to display (the unit at the cursor) and advances;
 * `prev` steps back to re-show the unit before the last-shown one.
 */
export function advanceCursor(s: StudySession, direction: 1 | -1): number {
  if (direction === 1) {
    if (s.cursor >= s.units.length) {
      throw new StudyError(`End of scope: all ${s.units.length} units read. See 'bible study coverage' or 'bible study review'.`);
    }
    const idx = s.cursor;
    s.cursor = idx + 1;
    return idx;
  }
  const idx = s.cursor - 2;
  if (idx < 0) throw new StudyError('Already at the beginning of the scope.');
  s.cursor = idx + 1;
  return idx;
}

/** Move the cursor so that `next` reads the unit containing verseId. */
export function gotoUnit(s: StudySession, verseId: number): number {
  const idx = s.units.findIndex((u) => u.start <= verseId && verseId <= u.end);
  if (idx === -1) {
    throw new StudyError(`Reference is outside this session's scope (${s.scope.input}).`);
  }
  s.cursor = idx;
  return idx;
}

export function logRead(s: StudySession, unitIdx: number): void {
  s.read_log.push({ unit: unitIdx, ref: s.units[unitIdx]!.label, ts: new Date().toISOString() });
}

// ---------- notebook ----------

export function addNote(
  s: StudySession,
  o: { type: NoteType; text: string; refs: number[]; against?: number; unitRef?: string },
): StudyNote {
  if (!NOTE_TYPES.includes(o.type)) {
    throw new StudyError(`Unknown note type '${o.type}'. Types: ${NOTE_TYPES.join(', ')}.`);
  }
  if (!o.text.trim()) throw new StudyError('Note text is empty.');
  if (o.refs.length === 0) {
    throw new StudyError(
      'A note must be anchored to exact verses. Pass --refs, or read a unit first so the note can anchor to it — free-floating notes are rejected.',
    );
  }
  if (o.type === 'counterexample') {
    if (o.against === undefined) {
      throw new StudyError("A counterexample must name the note it tests: --against <noteId>. It does not flip the pattern's status — use 'bible study resolve'.");
    }
    const target = s.notes.find((n) => n.id === o.against);
    if (!target) throw new StudyError(`--against ${o.against}: no such note.`);
    if (target.type !== 'pattern') throw new StudyError(`--against ${o.against}: note is a ${target.type}; counterexamples test patterns.`);
  } else if (o.against !== undefined) {
    throw new StudyError('--against is only valid for --type counterexample.');
  }
  const note: StudyNote = {
    id: s.notes.reduce((m, n) => Math.max(m, n.id), 0) + 1,
    type: o.type,
    text: o.text.trim(),
    refs: [...new Set(o.refs)].sort((a, b) => a - b),
    unit_ref: o.unitRef ?? (s.read_log.length > 0 ? s.read_log[s.read_log.length - 1]!.ref : '(before reading)'),
    created: new Date().toISOString(),
    ...(o.type === 'pattern' ? { status: 'open' as NoteStatus } : {}),
    ...(o.against !== undefined ? { links: [o.against] } : {}),
  };
  s.notes.push(note);
  return note;
}

export function resolveNote(s: StudySession, id: number, status: NoteStatus): StudyNote {
  if (!NOTE_STATUSES.includes(status)) {
    throw new StudyError(`Invalid status '${status}'. Statuses: ${NOTE_STATUSES.join(', ')}.`);
  }
  const note = s.notes.find((n) => n.id === id);
  if (!note) throw new StudyError(`No note #${id}.`);
  if (note.type !== 'pattern') throw new StudyError(`Note #${id} is a ${note.type}; only patterns carry a status.`);
  note.status = status;
  return note;
}

// ---------- recurrence surfacing ----------

export interface Recurrence {
  note_id: number;
  note_type: NoteType;
  note_text: string;
  lemmas: string[];
  at: number[]; // verse ids in the current unit where the shared lemmas occur
}

/** Injected lemma lookups (backed by the study db; fakes in tests). */
export interface LemmaSource {
  /** Distinctive lemmas (corpus frequency <= 300) occurring in these verses. */
  distinctiveLemmas(refs: number[]): string[];
  /** All lemmas occurring in a verse-id range. */
  unitLemmas(start: number, end: number): Set<string>;
  /** Verse ids in the range where any of these lemmas occur. */
  locations(start: number, end: number, lemmas: string[]): number[];
}

/**
 * Open patterns and questions whose distinctive evidence vocabulary recurs in
 * the current unit (>= 2 shared distinctive lemmas). Notes anchored inside the
 * unit itself are skipped — re-reading your own anchor is not a recurrence.
 * Per-note lemma sets are cached in the session (notes are immutable).
 */
export function findRecurrences(s: StudySession, unitIdx: number, src: LemmaSource): Recurrence[] {
  const unit = s.units[unitIdx];
  if (!unit) return [];
  const candidates = s.notes.filter(
    (n) =>
      ((n.type === 'pattern' && n.status === 'open') || n.type === 'question') &&
      !n.refs.some((r) => unit.start <= r && r <= unit.end),
  );
  if (candidates.length === 0) return [];
  const unitSet = src.unitLemmas(unit.start, unit.end);
  const out: Recurrence[] = [];
  for (const n of candidates) {
    let lemmas = s.lemma_cache[String(n.id)];
    if (!lemmas) {
      lemmas = src.distinctiveLemmas(n.refs);
      s.lemma_cache[String(n.id)] = lemmas;
    }
    const shared = lemmas.filter((l) => unitSet.has(l));
    if (shared.length >= 2) {
      out.push({
        note_id: n.id,
        note_type: n.type,
        note_text: n.text,
        lemmas: shared,
        at: src.locations(unit.start, unit.end, shared),
      });
    }
  }
  return out;
}

// ---------- coverage + review ----------

export interface Coverage {
  units_total: number;
  units_read: number;
  percent: number;
  books: Array<{ book: string; units: number; read: number }>;
  gaps: Array<{ from: string; to: string; units: number }>;
  notes: { by_type: Record<string, number>; patterns_by_status: Record<string, number> };
}

export function coverage(s: StudySession): Coverage {
  const read = new Set(s.read_log.map((r) => r.unit));
  const books = new Map<string, { units: number; read: number }>();
  for (let i = 0; i < s.units.length; i++) {
    const bn = splitVerseId(s.units[i]!.start).bookNum;
    const name = byBookNum.get(bn)?.name ?? `book${bn}`;
    const b = books.get(name) ?? { units: 0, read: 0 };
    b.units += 1;
    if (read.has(i)) b.read += 1;
    books.set(name, b);
  }
  const gaps: Coverage['gaps'] = [];
  let runStart = -1;
  for (let i = 0; i <= s.units.length; i++) {
    const unread = i < s.units.length && !read.has(i);
    if (unread && runStart === -1) runStart = i;
    if (!unread && runStart !== -1) {
      gaps.push({ from: s.units[runStart]!.label, to: s.units[i - 1]!.label, units: i - runStart });
      runStart = -1;
    }
  }
  const byType: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  for (const n of s.notes) {
    byType[n.type] = (byType[n.type] ?? 0) + 1;
    if (n.type === 'pattern') byStatus[n.status ?? 'open'] = (byStatus[n.status ?? 'open'] ?? 0) + 1;
  }
  return {
    units_total: s.units.length,
    units_read: read.size,
    percent: s.units.length === 0 ? 0 : Math.round((100 * read.size) / s.units.length),
    books: [...books.entries()].map(([book, b]) => ({ book, ...b })),
    gaps,
    notes: { by_type: byType, patterns_by_status: byStatus },
  };
}

/** Notes whose first anchor lies at or before endId, grouped by type. */
export function notesThrough(s: StudySession, endId: number): Map<NoteType, StudyNote[]> {
  const grouped = new Map<NoteType, StudyNote[]>();
  for (const t of NOTE_TYPES) grouped.set(t, []);
  for (const n of s.notes) {
    if (Math.min(...n.refs) <= endId) grouped.get(n.type)!.push(n);
  }
  return grouped;
}

// ---------- persistence (JSON files, atomic writes) ----------

export function studiesDir(dir?: string): string {
  return dir ?? path.join(dataDir(), 'studies');
}

export function sessionPath(name: string, dir?: string): string {
  return path.join(studiesDir(dir), `${slugify(name)}.json`);
}

export function sessionExists(name: string, dir?: string): boolean {
  return fs.existsSync(sessionPath(name, dir));
}

const LOCK_TIMEOUT_MS = 5_000;
const LOCK_STALE_MS = 15_000;

/**
 * Advisory per-session lock covering a whole load-modify-save transaction, so
 * overlapping invocations (parallel MCP calls, two shells) cannot silently
 * drop each other's notes or cursor moves. mkdir is the atomic primitive;
 * locks abandoned by killed processes are taken over after LOCK_STALE_MS.
 */
export function lockSession(name: string, dir?: string): () => void {
  const lp = sessionPath(name, dir) + '.lock';
  fs.mkdirSync(path.dirname(lp), { recursive: true });
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  for (;;) {
    try {
      fs.mkdirSync(lp);
      return () => {
        try {
          fs.rmdirSync(lp);
        } catch {
          // already removed by a stale-lock takeover
        }
      };
    } catch {
      try {
        if (Date.now() - fs.statSync(lp).mtimeMs > LOCK_STALE_MS) {
          fs.rmdirSync(lp);
          continue;
        }
      } catch {
        continue; // lock vanished between mkdir and stat — retry immediately
      }
      if (Date.now() > deadline) {
        throw new StudyError(`Session '${name}' is in use by another bible process (if stale, remove ${lp}).`);
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 40);
    }
  }
}

export function saveSession(s: StudySession, dir?: string): void {
  const file = sessionPath(s.name, dir);
  s.updated = new Date().toISOString();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Unique temp name so overlapping invocations never clobber each other's
  // in-flight write; the rename itself is atomic.
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

export function loadSession(name: string, dir?: string): StudySession {
  const file = sessionPath(name, dir);
  if (!fs.existsSync(file)) {
    const known = listSessions(dir).map((s) => s.name);
    throw new StudyError(
      `No study session '${name}'.` + (known.length > 0 ? ` Sessions: ${known.join(', ')}.` : " Start one with 'bible study start <scope>'."),
    );
  }
  const s = JSON.parse(fs.readFileSync(file, 'utf8')) as StudySession;
  s.lemma_cache ??= {};
  return s;
}

export function listSessions(dir?: string): StudySession[] {
  const d = studiesDir(dir);
  if (!fs.existsSync(d)) return [];
  const sessions: StudySession[] = [];
  for (const f of fs.readdirSync(d)) {
    if (!f.endsWith('.json')) continue;
    try {
      const s = JSON.parse(fs.readFileSync(path.join(d, f), 'utf8')) as StudySession;
      if (s && typeof s.name === 'string' && Array.isArray(s.units)) sessions.push(s);
    } catch {
      // unreadable file: skip, never take the CLI down
    }
  }
  return sessions.sort((a, b) => (a.updated < b.updated ? 1 : -1));
}

/** The most recently updated session — the default when --name is omitted. */
export function defaultSession(dir?: string): StudySession {
  const all = listSessions(dir);
  if (all.length === 0) throw new StudyError("No study sessions yet. Start one with 'bible study start <scope>'.");
  return all[0]!;
}

export function deleteSession(name: string, dir?: string): void {
  const file = sessionPath(name, dir);
  if (!fs.existsSync(file)) throw new StudyError(`No study session '${name}'.`);
  fs.rmSync(file);
}
