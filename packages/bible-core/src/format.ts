/** Canonical display of verse ids and ranges ("John 15:4–5", "Genesis 1:1–2:3"). */

import { byBookNum, splitVerseId } from './canon.js';

const name = (bookNum: number): string => byBookNum.get(bookNum)?.name ?? `book${bookNum}`;
const v = (n: number): string => (n === 0 ? 'title' : String(n));

/**
 * Format an inclusive verse-id range. Whole chapters (verse 0/1 … 999) render
 * as "John 15"; whole books as "John"; a single verse as "John 3:16"; ranges
 * across books as "Genesis 50 – Exodus 2" or "Genesis–Exodus". En dashes.
 */
export function formatRange(start: number, end: number = start): string {
  const a = splitVerseId(start);
  const z = splitVerseId(end);
  // Scope sentinels: chapter 0 (bookRange start) means "from chapter 1";
  // chapter 999 (bookRange end) means "to the last chapter".
  const lastCh = (b: number) => byBookNum.get(b)?.chapters ?? z.chapter;
  const aCh = a.chapter === 0 ? 1 : a.chapter;
  const aV = a.chapter === 0 ? 0 : a.verse;
  const zCh = Math.min(z.chapter, lastCh(z.bookNum));
  const zV = z.chapter > lastCh(z.bookNum) ? 999 : z.verse;
  const startsBook = aCh === 1 && aV <= 1;
  const endsBook = zCh === lastCh(z.bookNum) && zV === 999;

  if (a.bookNum !== z.bookNum) {
    if (startsBook && endsBook) return `${name(a.bookNum)}–${name(z.bookNum)}`;
    const left = formatRange(a.bookNum * 1_000_000 + aCh * 1_000 + aV, a.bookNum * 1_000_000 + lastCh(a.bookNum) * 1_000 + 999);
    const right = formatRange(z.bookNum * 1_000_000 + 1_000, z.bookNum * 1_000_000 + zCh * 1_000 + zV);
    return `${left} – ${right}`;
  }
  const book = name(a.bookNum);
  if (startsBook && endsBook) return book;
  const wholeChapterStart = aV <= 1;
  const wholeChapterEnd = zV === 999;
  if (wholeChapterStart && wholeChapterEnd) return aCh === zCh ? `${book} ${aCh}` : `${book} ${aCh}–${zCh}`;
  if (aCh === zCh && aV === zV) return `${book} ${aCh}:${v(aV)}`;
  if (aCh === zCh) return `${book} ${aCh}:${v(aV)}–${v(zV)}`;
  return `${book} ${aCh}:${v(aV)}–${zCh}:${zV === 999 ? 'end' : v(zV)}`;
}
