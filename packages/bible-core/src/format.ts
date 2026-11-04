/** Canonical display of verse ids and ranges ("John 15:4–5", "Genesis 1:1–2:3"). */

import { byBookNum, splitVerseId } from './canon.js';

const name = (bookNum: number): string => byBookNum.get(bookNum)?.name ?? `book${bookNum}`;
const v = (n: number): string => (n === 0 ? 'title' : String(n));

/**
 * Format an inclusive verse-id range. Whole chapters (verse 0/1 … 999) render
 * as "John 15"; whole books as "John"; a single verse as "John 3:16".
 * Ranges use an en dash.
 */
export function formatRange(start: number, end: number = start): string {
  const a = splitVerseId(start);
  const z = splitVerseId(end);
  const book = byBookNum.get(a.bookNum);
  if (a.bookNum !== z.bookNum) {
    return `${formatRange(start, a.bookNum * 1_000_000 + 999_999)}–${formatRange(z.bookNum * 1_000_000 + 1_000, end)}`;
  }
  const wholeChapterStart = a.verse <= 1;
  const wholeChapterEnd = z.verse === 999;
  if (book && a.chapter === 1 && wholeChapterStart && z.chapter >= book.chapters && wholeChapterEnd) {
    return book.name;
  }
  if (wholeChapterStart && wholeChapterEnd) {
    return a.chapter === z.chapter ? `${name(a.bookNum)} ${a.chapter}` : `${name(a.bookNum)} ${a.chapter}–${z.chapter}`;
  }
  if (start === end) return `${name(a.bookNum)} ${a.chapter}:${v(a.verse)}`;
  if (a.chapter === z.chapter) return `${name(a.bookNum)} ${a.chapter}:${v(a.verse)}–${v(z.verse)}`;
  return `${name(a.bookNum)} ${a.chapter}:${v(a.verse)}–${z.chapter}:${z.verse === 999 ? 'end' : v(z.verse)}`;
}

/** Abbreviated form for chips: "Jn 15:4–5" style using the USFM code ("JHN 15:4–5"). */
export function formatRangeShort(start: number, end: number = start): string {
  const a = splitVerseId(start);
  const book = byBookNum.get(a.bookNum);
  const full = formatRange(start, end);
  return book ? full.replace(book.name, book.usfm.charAt(0) + book.usfm.slice(1).toLowerCase()) : full;
}
