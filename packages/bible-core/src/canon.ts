/**
 * The 66-book Protestant canon: canonical numbering, standard codes, and
 * name aliases used by the reference parser and every pipeline stage.
 *
 * bookNum is stable and doubles as canonical order. Verse IDs are
 * bookNum * 1_000_000 + chapter * 1_000 + verse (BBCCCVVV).
 * Verse 0 of a chapter is reserved for Hebrew superscriptions (Psalm titles).
 */

export interface Book {
  bookNum: number;
  usfm: string; // USFM/Paratext 3-letter code
  osis: string; // OSIS code
  name: string;
  testament: 'OT' | 'NT';
  chapters: number;
  aliases: string[]; // extra lowercase aliases beyond generated ones
}

const b = (
  bookNum: number,
  usfm: string,
  osis: string,
  name: string,
  testament: 'OT' | 'NT',
  chapters: number,
  aliases: string[] = [],
): Book => ({ bookNum, usfm, osis, name, testament, chapters, aliases });

export const BOOKS: Book[] = [
  b(1, 'GEN', 'Gen', 'Genesis', 'OT', 50, ['gn', 'ge']),
  b(2, 'EXO', 'Exod', 'Exodus', 'OT', 40, ['ex', 'exod']),
  b(3, 'LEV', 'Lev', 'Leviticus', 'OT', 27, ['lv']),
  b(4, 'NUM', 'Num', 'Numbers', 'OT', 36, ['nm', 'nb']),
  b(5, 'DEU', 'Deut', 'Deuteronomy', 'OT', 34, ['dt', 'deut']),
  b(6, 'JOS', 'Josh', 'Joshua', 'OT', 24, ['josh']),
  b(7, 'JDG', 'Judg', 'Judges', 'OT', 21, ['judg', 'jdgs']),
  b(8, 'RUT', 'Ruth', 'Ruth', 'OT', 4, ['ru', 'rth']),
  b(9, '1SA', '1Sam', '1 Samuel', 'OT', 31, ['1sam', '1sm', 'isam', 'isamuel']),
  b(10, '2SA', '2Sam', '2 Samuel', 'OT', 24, ['2sam', '2sm', 'iisam', 'iisamuel']),
  b(11, '1KI', '1Kgs', '1 Kings', 'OT', 22, ['1kgs', '1kin', '1kg', 'ikings']),
  b(12, '2KI', '2Kgs', '2 Kings', 'OT', 25, ['2kgs', '2kin', '2kg', 'iikings']),
  b(13, '1CH', '1Chr', '1 Chronicles', 'OT', 29, ['1chr', '1chron', 'ichronicles']),
  b(14, '2CH', '2Chr', '2 Chronicles', 'OT', 36, ['2chr', '2chron', 'iichronicles']),
  b(15, 'EZR', 'Ezra', 'Ezra', 'OT', 10, []),
  b(16, 'NEH', 'Neh', 'Nehemiah', 'OT', 13, []),
  b(17, 'EST', 'Esth', 'Esther', 'OT', 10, ['esth']),
  b(18, 'JOB', 'Job', 'Job', 'OT', 42, ['jb']),
  b(19, 'PSA', 'Ps', 'Psalms', 'OT', 150, ['ps', 'pss', 'psalm', 'psm', 'psa']),
  b(20, 'PRO', 'Prov', 'Proverbs', 'OT', 31, ['prov', 'prv', 'pr']),
  b(21, 'ECC', 'Eccl', 'Ecclesiastes', 'OT', 12, ['eccl', 'eccles', 'qoheleth', 'qohelet']),
  b(22, 'SNG', 'Song', 'Song of Solomon', 'OT', 8, ['song', 'songofsongs', 'sos', 'canticles', 'cant']),
  b(23, 'ISA', 'Isa', 'Isaiah', 'OT', 66, ['is']),
  b(24, 'JER', 'Jer', 'Jeremiah', 'OT', 52, ['jr']),
  b(25, 'LAM', 'Lam', 'Lamentations', 'OT', 5, []),
  b(26, 'EZK', 'Ezek', 'Ezekiel', 'OT', 48, ['ezek', 'eze']),
  b(27, 'DAN', 'Dan', 'Daniel', 'OT', 12, ['dn']),
  b(28, 'HOS', 'Hos', 'Hosea', 'OT', 14, []),
  b(29, 'JOL', 'Joel', 'Joel', 'OT', 3, ['joe', 'jl']),
  b(30, 'AMO', 'Amos', 'Amos', 'OT', 9, ['am']),
  b(31, 'OBA', 'Obad', 'Obadiah', 'OT', 1, ['obad', 'ob']),
  b(32, 'JON', 'Jonah', 'Jonah', 'OT', 4, ['jnh']),
  b(33, 'MIC', 'Mic', 'Micah', 'OT', 7, ['mc']),
  b(34, 'NAM', 'Nah', 'Nahum', 'OT', 3, ['nah', 'na']),
  b(35, 'HAB', 'Hab', 'Habakkuk', 'OT', 3, ['hb']),
  b(36, 'ZEP', 'Zeph', 'Zephaniah', 'OT', 3, ['zeph', 'zp']),
  b(37, 'HAG', 'Hag', 'Haggai', 'OT', 2, ['hg']),
  b(38, 'ZEC', 'Zech', 'Zechariah', 'OT', 14, ['zech', 'zc']),
  b(39, 'MAL', 'Mal', 'Malachi', 'OT', 4, ['ml']),
  b(40, 'MAT', 'Matt', 'Matthew', 'NT', 28, ['matt', 'mt']),
  b(41, 'MRK', 'Mark', 'Mark', 'NT', 16, ['mk', 'mrk', 'mar']),
  b(42, 'LUK', 'Luke', 'Luke', 'NT', 24, ['lk', 'luk']),
  b(43, 'JHN', 'John', 'John', 'NT', 21, ['jn', 'jhn', 'joh']),
  b(44, 'ACT', 'Acts', 'Acts', 'NT', 28, ['ac', 'act']),
  b(45, 'ROM', 'Rom', 'Romans', 'NT', 16, ['rm', 'ro']),
  b(46, '1CO', '1Cor', '1 Corinthians', 'NT', 16, ['1cor', 'icorinthians', '1cr']),
  b(47, '2CO', '2Cor', '2 Corinthians', 'NT', 13, ['2cor', 'iicorinthians', '2cr']),
  b(48, 'GAL', 'Gal', 'Galatians', 'NT', 6, ['ga']),
  b(49, 'EPH', 'Eph', 'Ephesians', 'NT', 6, []),
  b(50, 'PHP', 'Phil', 'Philippians', 'NT', 4, ['phil', 'php', 'philip']),
  b(51, 'COL', 'Col', 'Colossians', 'NT', 4, []),
  b(52, '1TH', '1Thess', '1 Thessalonians', 'NT', 5, ['1thess', '1thes', 'ithessalonians', '1ths']),
  b(53, '2TH', '2Thess', '2 Thessalonians', 'NT', 3, ['2thess', '2thes', 'iithessalonians', '2ths']),
  b(54, '1TI', '1Tim', '1 Timothy', 'NT', 6, ['1tim', 'itimothy', '1tm']),
  b(55, '2TI', '2Tim', '2 Timothy', 'NT', 4, ['2tim', 'iitimothy', '2tm']),
  b(56, 'TIT', 'Titus', 'Titus', 'NT', 3, ['ti']),
  b(57, 'PHM', 'Phlm', 'Philemon', 'NT', 1, ['phlm', 'phm', 'philem']),
  b(58, 'HEB', 'Heb', 'Hebrews', 'NT', 13, []),
  b(59, 'JAS', 'Jas', 'James', 'NT', 5, ['jas', 'jm', 'jam']),
  b(60, '1PE', '1Pet', '1 Peter', 'NT', 5, ['1pet', '1pt', 'ipeter']),
  b(61, '2PE', '2Pet', '2 Peter', 'NT', 3, ['2pet', '2pt', 'iipeter']),
  b(62, '1JN', '1John', '1 John', 'NT', 5, ['1jn', '1jo', '1jhn', 'ijohn']),
  b(63, '2JN', '2John', '2 John', 'NT', 1, ['2jn', '2jo', '2jhn', 'iijohn']),
  b(64, '3JN', '3John', '3 John', 'NT', 1, ['3jn', '3jo', '3jhn', 'iiijohn']),
  b(65, 'JUD', 'Jude', 'Jude', 'NT', 1, ['jde']),
  b(66, 'REV', 'Rev', 'Revelation', 'NT', 22, ['rv', 'apocalypse', 'apoc']),
];

export const byBookNum = new Map<number, Book>(BOOKS.map((bk) => [bk.bookNum, bk]));

const normalizeAlias = (s: string): string => s.toLowerCase().replace(/[\s.’']/g, '');

/** Map of normalized alias -> bookNum. Covers usfm, osis, full name, and hand aliases. */
export const bookAliases: Map<string, number> = (() => {
  const m = new Map<string, number>();
  for (const bk of BOOKS) {
    const names = [bk.usfm, bk.osis, bk.name, ...bk.aliases];
    // "1 Samuel" also as "first samuel" / "i samuel"
    const ordinal = bk.name.match(/^([123]) (.+)$/);
    if (ordinal) {
      const [, n, rest] = ordinal;
      const words: Record<string, string[]> = {
        '1': ['first', 'i'],
        '2': ['second', 'ii'],
        '3': ['third', 'iii'],
      };
      for (const w of words[n!]!) names.push(`${w} ${rest}`);
    }
    for (const name of names) {
      const key = normalizeAlias(name);
      if (!m.has(key)) m.set(key, bk.bookNum);
    }
  }
  return m;
})();

export function lookupBook(name: string): Book | undefined {
  const num = bookAliases.get(normalizeAlias(name));
  return num === undefined ? undefined : byBookNum.get(num);
}

/** Closest book names for did-you-mean suggestions. */
export function suggestBooks(input: string, max = 3): string[] {
  const key = normalizeAlias(input);
  const scored = BOOKS.map((bk) => {
    const cand = normalizeAlias(bk.name);
    return { name: bk.name, d: levenshtein(key, cand.slice(0, Math.max(key.length, 3))) };
  });
  scored.sort((a, z) => a.d - z.d);
  return scored.slice(0, max).map((s) => s.name);
}

function levenshtein(a: string, s: string): number {
  const m = a.length;
  const n = s.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]!;
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j]!;
      dp[j] = Math.min(dp[j]! + 1, dp[j - 1]! + 1, prev + (a[i - 1] === s[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[n]!;
}

// ---- verse id helpers (BBCCCVVV) ----

export function makeVerseId(bookNum: number, chapter: number, verse: number): number {
  return bookNum * 1_000_000 + chapter * 1_000 + verse;
}

export function splitVerseId(verseId: number): { bookNum: number; chapter: number; verse: number } {
  const bookNum = Math.floor(verseId / 1_000_000);
  const chapter = Math.floor((verseId % 1_000_000) / 1_000);
  const verse = verseId % 1_000;
  return { bookNum, chapter, verse };
}

/** "John 3:16" for display; verse 0 renders as "(title)". */
export function formatVerseId(verseId: number): string {
  const { bookNum, chapter, verse } = splitVerseId(verseId);
  const bk = byBookNum.get(bookNum);
  const name = bk ? bk.name : `book${bookNum}`;
  return verse === 0 ? `${name} ${chapter}:title` : `${name} ${chapter}:${verse}`;
}

/** Whole-book id range. */
export function bookRange(bookNum: number): { start: number; end: number } {
  return { start: bookNum * 1_000_000, end: bookNum * 1_000_000 + 999_999 };
}
