import { describe, expect, it } from 'vitest';
import { concentration, findSequences, normalizeLemma, parseFormula } from '../src/commands/pattern.js';

describe('parseFormula', () => {
  it('parses Strong\'s numbers with language and suffix', () => {
    const r = parseFormula('H430 G26 H2617a');
    if ('error' in r) throw new Error(r.error);
    expect(r.items).toEqual([
      { kind: 'strongs', raw: 'H430', lang: 'H', num: 430 },
      { kind: 'strongs', raw: 'G26', lang: 'G', num: 26 },
      { kind: 'strongs', raw: 'H2617a', lang: 'H', num: 2617, suffix: 'a' },
    ]);
  });

  it('accepts lowercase strongs prefixes', () => {
    const r = parseFormula('h2142 g0026');
    if ('error' in r) throw new Error(r.error);
    expect(r.items[0]).toMatchObject({ kind: 'strongs', lang: 'H', num: 2142 });
    expect(r.items[1]).toMatchObject({ kind: 'strongs', lang: 'G', num: 26 });
  });

  it('parses original-script lemmas with normalization', () => {
    const r = parseFormula('אֱלֹהִים ἀγάπη');
    if ('error' in r) throw new Error(r.error);
    expect(r.items[0]).toMatchObject({ kind: 'lemma', raw: 'אֱלֹהִים', norm: normalizeLemma('אֱלֹהִים') });
    expect(r.items[1]).toMatchObject({ kind: 'lemma', norm: 'αγαπη' });
  });

  it('rejects English words with a helpful message', () => {
    const r = parseFormula('remember covenant');
    expect('error' in r && r.error).toMatch(/original-language only/);
  });

  it('rejects single-item formulas', () => {
    const r = parseFormula('H2142');
    expect('error' in r && r.error).toMatch(/at least two/);
  });

  it('mixes strongs and lemmas', () => {
    const r = parseFormula('H2142 בְּרִית');
    if ('error' in r) throw new Error(r.error);
    expect(r.items.map((i) => i.kind)).toEqual(['strongs', 'lemma']);
  });
});

describe('normalizeLemma', () => {
  it('strips Hebrew points and Greek accents, folds final sigma', () => {
    expect(normalizeLemma('בְּרִית')).toBe('ברית');
    expect(normalizeLemma('ἀγάπης')).toBe('αγαπησ');
    expect(normalizeLemma('Λόγος')).toBe('λογοσ');
  });
});

describe('findSequences', () => {
  // slotMatches[slot][item]
  const grid = (rows: string[]): boolean[][] => rows.map((r) => r.split('').map((c) => c === '1'));

  it('finds adjacent sequences with slack 0', () => {
    // items: A B; slots: A, B, A, x, B
    const m = grid(['10', '01', '10', '00', '01']);
    expect(findSequences(m, 2, 0)).toEqual([[0, 1]]);
  });

  it('allows intervening words with slack', () => {
    const m = grid(['10', '00', '01']);
    expect(findSequences(m, 2, 0)).toEqual([]);
    expect(findSequences(m, 2, 1)).toEqual([[0, 2]]);
  });

  it('finds multiple occurrences', () => {
    const m = grid(['10', '01', '10', '01']);
    expect(findSequences(m, 2, 0)).toEqual([[0, 1], [2, 3]]);
  });

  it('handles three-item formulas', () => {
    const m = grid(['100', '010', '000', '001']);
    expect(findSequences(m, 3, 0)).toEqual([]);
    expect(findSequences(m, 3, 1)).toEqual([[0, 3]]);
  });

  it('a slot matching several items can serve each position', () => {
    // item A and B both match slot 1
    const m = grid(['11', '11']);
    expect(findSequences(m, 2, 0)).toEqual([[0, 1]]);
  });

  it('backtracks past a decoy intermediate match', () => {
    // items A B C over slots A, B, B, -, C with slack 1: only 0→2→4 works;
    // a greedy scan would bind B at slot 1 and fail to reach C.
    const m = grid(['100', '010', '010', '000', '001']);
    expect(findSequences(m, 3, 1)).toEqual([[0, 4]]);
  });

  it('backtracking still respects slack limits', () => {
    const m = grid(['100', '010', '010', '000', '000', '001']);
    expect(findSequences(m, 3, 1)).toEqual([]);
  });
});

describe('concentration', () => {
  it('computes expected counts from token share and ratios to 1 decimal', () => {
    const observed = new Map([[1, 8], [19, 2]]);
    const tokens = new Map([[1, 1000], [19, 3000], [23, 6000]]); // shares 0.1, 0.3, 0.6
    const rows = concentration(observed, tokens, 10);
    expect(rows).toEqual([
      { book_num: 1, observed: 8, expected: 1, ratio: 8 },
      { book_num: 19, observed: 2, expected: 3, ratio: 0.7 },
    ]);
  });

  it('sorts by observed descending', () => {
    const rows = concentration(new Map([[1, 1], [2, 5]]), new Map([[1, 100], [2, 100]]), 6);
    expect(rows.map((r) => r.book_num)).toEqual([2, 1]);
  });

  it('rounds ratio to one decimal', () => {
    const rows = concentration(new Map([[1, 1]]), new Map([[1, 300], [2, 700]]), 3);
    // expected = 3 * 0.3 = 0.9; ratio = 1/0.9 = 1.111 -> 1.1
    expect(rows[0]!.expected).toBe(0.9);
    expect(rows[0]!.ratio).toBe(1.1);
  });
});
