/**
 * Reading-plan units: the pure parts of the CLI's study sessions and
 * `bible read`, shared with the app's Plans tab and the gateway's save_plan.
 */

import { byBookNum, makeVerseId } from './canon.js';
import { parseScope } from './refparse.js';

export interface ScopeRange {
  start: number;
  end: number;
  label: string;
}

export interface Unit {
  label: string;
  start: number;
  end: number;
}

/** A flowed chapter with its character count, as loaded by the caller. */
export interface ChapterText {
  bookNum: number;
  chapter: number;
  chars: number;
}

/** Like parseScope, plus 'bible' for the whole canon. Throws RefError. */
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

/** Greedy character-budget packing of consecutive chapters (never splits a chapter). */
export function chunkChapters<T extends ChapterText>(chapters: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  let current: T[] = [];
  let size = 0;
  for (const ch of chapters) {
    if (current.length > 0 && size + ch.chars > chunkSize) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(ch);
    size += ch.chars;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/**
 * Character-budgeted chunk units. Chapters come from the injected loader,
 * grouped per book (units never span book boundaries).
 */
export function chunkUnits<T extends ChapterText>(
  ranges: ScopeRange[],
  loader: (start: number, end: number) => T[],
  chunkSize: number,
): Unit[] {
  const units: Unit[] = [];
  for (const r of ranges) {
    const chapters = loader(r.start, r.end);
    const perBook: T[][] = [];
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

/** Days needed to finish `unitCount` units at `pace` units/day. */
export function planDays(unitCount: number, pace: number): number {
  if (pace <= 0) throw new RangeError('pace must be > 0');
  return Math.ceil(unitCount / pace);
}
