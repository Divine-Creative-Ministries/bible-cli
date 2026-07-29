/**
 * Forgiving scripture-reference parser.
 *
 * Accepts canonical and sloppy forms:
 *   "John 3:16", "John 3:16-18", "jn 3 16", "1jn2:5", "Gen.1.1", "Psalm 23",
 *   "Genesis 1:1-2:3", "Jude 5", "Obadiah 1:1", "psa 51:title"
 *
 * A parsed reference is a verse-id range on the canonical spine (BBCCCVVV).
 */

import { Book, lookupBook, makeVerseId, suggestBooks } from '../canon.js';

export interface ParsedRef {
  book: Book;
  /** inclusive verse-id range */
  start: number;
  end: number;
  /** what granularity the user gave */
  kind: 'book' | 'chapter' | 'verse' | 'range';
}

export class RefError extends Error {
  suggestions: string[];
  constructor(message: string, suggestions: string[] = []) {
    super(message);
    this.suggestions = suggestions;
  }
}

const SINGLE_CHAPTER_BOOKS = new Set([31, 57, 63, 64, 65]); // Oba, Phm, 2Jn, 3Jn, Jud

/**
 * Split "1 jn 2:5" into book part and numeric tail. The book part may itself
 * start with a digit (1/2/3 or roman i/ii/iii), so we take the longest prefix
 * that resolves to a known book.
 */
export function parseRef(input: string): ParsedRef {
  const raw = input.trim();
  if (!raw) throw new RefError('Empty reference');

  // Normalize separators: dots used STEPBible-style (Gen.1.1) become spaces/colons later.
  const s = raw.replace(/\s+/g, ' ');

  // Try longest book-name prefix first.
  // Candidate split points: before each digit-group/punctuation boundary.
  const candidates: Array<{ book: Book; rest: string }> = [];
  const re = /[\s.:,;]+|(?<=[a-zA-Z])(?=\d)/g; // boundaries
  const positions: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) positions.push(m.index);
  positions.push(s.length);
  for (const pos of positions.reverse()) {
    const head = s.slice(0, pos).trim();
    if (!head) continue;
    const book = lookupBook(head);
    if (book) {
      candidates.push({ book, rest: s.slice(pos).replace(/^[\s.:,;]+/, '') });
      break; // longest match wins
    }
  }

  if (candidates.length === 0) {
    const headGuess = s.replace(/[\d:.,;\-–—].*$/, '').trim() || s;
    throw new RefError(
      `Unknown book '${headGuess}'. Did you mean: ${suggestBooks(headGuess).join(', ')}?`,
      suggestBooks(headGuess),
    );
  }

  const { book, rest } = candidates[0]!;
  if (!rest) {
    // whole book
    return {
      book,
      start: makeVerseId(book.bookNum, 1, 0),
      end: makeVerseId(book.bookNum, book.chapters, 999),
      kind: 'book',
    };
  }

  // Tokenize the numeric tail: numbers, 'title', and separators : . - – —
  const tail = rest.toLowerCase().replace(/–|—/g, '-');
  const tok = tail.match(/^(\d+|title|end)([\s.:]+(\d+|title|end))?\s*(-\s*(\d+|title|end)([\s.:]+(\d+|title|end))?)?$/);
  if (!tok) {
    throw new RefError(
      `Cannot parse reference '${input}'. Expected forms like 'John 3', 'John 3:16', 'John 3:16-18', 'Gen 1:1-2:3'.`,
    );
  }

  const a1 = tok[1]!; // first number
  const a2 = tok[3]; // optional second number (after : or .)
  const b1 = tok[5]; // range start of second half
  const b2 = tok[7]; // optional second number of second half

  const num = (t: string | undefined): number | undefined => {
    if (t === undefined) return undefined;
    if (t === 'title') return 0;
    if (t === 'end') return 999;
    return parseInt(t, 10);
  };

  const single = SINGLE_CHAPTER_BOOKS.has(book.bookNum);

  // Interpret first half
  let startCh: number;
  let startV: number | undefined;
  if (a2 !== undefined) {
    startCh = num(a1)!;
    startV = num(a2)!;
  } else if (single) {
    // "Jude 5" means verse 5 of the single chapter
    startCh = 1;
    startV = num(a1)!;
  } else {
    startCh = num(a1)!;
    startV = undefined; // whole chapter
  }

  if (startCh < 1 || startCh > book.chapters) {
    throw new RefError(`${book.name} has ${book.chapters} chapter${book.chapters === 1 ? 's' : ''}; got chapter ${startCh}.`);
  }

  if (b1 === undefined) {
    if (startV === undefined) {
      return {
        book,
        start: makeVerseId(book.bookNum, startCh, 0),
        end: makeVerseId(book.bookNum, startCh, 999),
        kind: 'chapter',
      };
    }
    const id = makeVerseId(book.bookNum, startCh, startV);
    return { book, start: id, end: id, kind: 'verse' };
  }

  // Range second half
  let endCh: number;
  let endV: number;
  if (b2 !== undefined) {
    endCh = num(b1)!;
    endV = num(b2)!;
  } else if (startV === undefined) {
    // "Gen 1-3": chapter range
    endCh = num(b1)!;
    endV = 999;
    startV = 0;
  } else {
    // "John 3:16-18": same chapter
    endCh = startCh;
    endV = num(b1)!;
  }

  if (endCh < 1 || endCh > book.chapters) {
    throw new RefError(`${book.name} has ${book.chapters} chapter${book.chapters === 1 ? 's' : ''}; got chapter ${endCh}.`);
  }

  const start = makeVerseId(book.bookNum, startCh, startV ?? 0);
  const end = makeVerseId(book.bookNum, endCh, endV);
  if (end < start) throw new RefError(`Range end precedes start in '${input}'.`);
  return { book, start, end, kind: 'range' };
}

/**
 * Parse a book-or-range scope filter like "Isaiah", "Psalms", "Gen-Deu",
 * "ot"/"nt", used by --book flags. Returns inclusive verse-id ranges.
 */
export function parseScope(input: string): Array<{ start: number; end: number; label: string }> {
  const s = input.trim().toLowerCase();
  if (s === 'ot') return [{ start: 1_000_000, end: 39_999_999, label: 'OT' }];
  if (s === 'nt') return [{ start: 40_000_000, end: 66_999_999, label: 'NT' }];
  const dash = s.match(/^([^-]+)-([^-]+)$/);
  if (dash) {
    const a = lookupBook(dash[1]!.trim());
    const z = lookupBook(dash[2]!.trim());
    if (a && z && a.bookNum <= z.bookNum) {
      return [
        {
          start: a.bookNum * 1_000_000,
          end: z.bookNum * 1_000_000 + 999_999,
          label: `${a.name}-${z.name}`,
        },
      ];
    }
  }
  // fall through: treat as a full reference (book, chapter, or verse range)
  const ref = parseRef(input);
  return [{ start: ref.start, end: ref.end, label: input }];
}
