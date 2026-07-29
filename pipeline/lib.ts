import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lookupBook, makeVerseId } from '../src/canon.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const RAW = path.join(ROOT, '.cache', 'raw');
export const DIST = path.join(ROOT, 'data', 'dist');

export function createDb(schemaFile: string, outPath: string): Database.Database {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  if (fs.existsSync(outPath)) fs.rmSync(outPath);
  const db = new Database(outPath);
  db.exec(fs.readFileSync(schemaFile, 'utf8'));
  return db;
}

export function sha256(file: string): string {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/** Read a STEPBible-style TSV: skip prose preamble, yield tab-split data rows. */
export function* stepRows(file: string, refPattern: RegExp): Generator<string[]> {
  const content = fs.readFileSync(file, 'utf8');
  for (const line of content.split('\n')) {
    const cells = line.replace(/\r$/, '').split('\t');
    if (cells.length < 2) continue;
    if (refPattern.test(cells[0]!)) yield cells;
  }
}

export interface StepRef {
  verseId: number; // spine (English) verse id
  wordNum: number;
  meta: string; // trailing '=L', '=NKO' etc.
  /** native-tradition ref when different from spine (from parens) */
  native?: { bookNum: number; chapter: number; verse: number };
}

/**
 * Parse STEPBible reference cells like:
 *   'Gen.1.1#01=L'  'Psa.51.0(51.1)#02=L'  'Mat.1.1#01=NKO'  'Rev.12.18[13.1]#04=NKO'
 * Sub-verse letters ('Gen.1.1a') are folded into the verse.
 */
export function parseStepRef(cell: string): StepRef | undefined {
  const m = cell.match(/^([1-3]?[A-Za-z]+)\.(\d+)\.(\d+)[a-d]?((?:\([^)]*\)|\[[^\]]*\]|\{[^}]*\})*)#(\d+)\s*=\s*(.*)$/);
  if (!m) return undefined;
  const book = lookupBook(m[1]!);
  if (!book) return undefined;
  const chapter = parseInt(m[2]!, 10);
  const verse = parseInt(m[3]!, 10);
  const ref: StepRef = {
    verseId: makeVerseId(book.bookNum, chapter, verse),
    wordNum: parseInt(m[5]!, 10),
    meta: m[6]!.trim(),
  };
  // Alternate refs: (Hebrew/NA tradition) and [KJV]; {other} ignored.
  // TAHOT parens = Hebrew numbering; TAGNT brackets = KJV numbering.
  const alts = m[4] ?? '';
  const paren = alts.match(/\((\d+)\.(\d+)[a-d]?\)/);
  const bracket = alts.match(/\[(\d+)\.(\d+)[a-d]?\]/);
  const alt = paren ?? bracket;
  if (alt) {
    ref.native = { bookNum: book.bookNum, chapter: parseInt(alt[1]!, 10), verse: parseInt(alt[2]!, 10) };
  }
  return ref;
}

// ---- Unicode normalization for original-language search columns ----

/** Strip Hebrew points/cantillation/punctuation; keep consonants + spaces. */
export function normalizeHebrew(s: string): string {
  return s
    .normalize('NFC')
    .replace(/[֑-ֽֿ-ׇ]/g, '') // cantillation + niqqud (keep maqaf U+05BE)
    .replace(/־/g, ' ') // maqaf acts as separator
    .replace(/[^א-תװ-ײ ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Lowercase unaccented Greek with final sigma folded. */
export function normalizeGreek(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ͂-ͅ]/g, '')
    .replace(/[^\p{Letter} ]/gu, '')
    .toLowerCase()
    .replace(/ς/g, 'σ')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Split extended Strong's 'H7225G' / 'G0976' / 'H1234a' into parts. */
export function splitStrongs(s: string): { strongs: string; num: number; suffix: string | null } | undefined {
  const m = s.match(/^([HG])(\d{1,4})([A-Za-z]?)$/);
  if (!m) return undefined;
  const num = parseInt(m[2]!, 10);
  const suffix = m[3] ? m[3] : null;
  return { strongs: `${m[1]}${String(num).padStart(4, '0')}${suffix ?? ''}`, num, suffix };
}

export function log(msg: string): void {
  process.stdout.write(`[pipeline] ${msg}\n`);
}
