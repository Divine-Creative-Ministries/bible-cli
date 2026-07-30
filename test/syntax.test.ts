import { describe, expect, it } from 'vitest';
import { KNOWN_ROLES, classifyNegator, normalizeRole, parseMaculaRef, parseMaculaStrongs } from '../pipeline/stages/syntax.js';
import { parseTerm } from '../src/commands/syntax.js';

describe('parseMaculaRef', () => {
  it('parses a Hebrew word ref', () => {
    expect(parseMaculaRef('GEN 1:1!5')).toEqual({ bookNum: 1, chapter: 1, verse: 1, wordPos: 5 });
  });
  it('parses a Greek word ref', () => {
    expect(parseMaculaRef('JHN 3:16!2')).toEqual({ bookNum: 43, chapter: 3, verse: 16, wordPos: 2 });
  });
  it('parses numbered-book codes', () => {
    expect(parseMaculaRef('1SA 17:4!1')).toMatchObject({ bookNum: 9 });
    expect(parseMaculaRef('2CH 36:23!10')).toMatchObject({ bookNum: 14, chapter: 36, verse: 23, wordPos: 10 });
  });
  it('rejects refs without a word position or with unknown books', () => {
    expect(parseMaculaRef('GEN 1:1')).toBeUndefined();
    expect(parseMaculaRef('XYZ 1:1!1')).toBeUndefined();
    expect(parseMaculaRef('')).toBeUndefined();
  });
});

describe('parseMaculaStrongs', () => {
  it('normalizes plain Hebrew numbers with zero padding', () => {
    expect(parseMaculaStrongs('7225', 'H')).toEqual({ strongs: 'H7225', num: 7225, compound: false });
    expect(parseMaculaStrongs('430', 'H')).toEqual({ strongs: 'H0430', num: 430, compound: false });
  });
  it('keeps dStrong suffixes', () => {
    expect(parseMaculaStrongs('0871a', 'H')).toEqual({ strongs: 'H0871a', num: 871, compound: false });
  });
  it('takes the first component of multi-word Hebrew values', () => {
    expect(parseMaculaStrongs('1886a|0725', 'H')).toEqual({ strongs: 'H1886a', num: 1886, compound: true });
  });
  it('takes the first component of Greek crasis compounds', () => {
    expect(parseMaculaStrongs('1537+4053', 'G')).toEqual({ strongs: 'G1537', num: 1537, compound: true });
    expect(parseMaculaStrongs('1722', 'G')).toEqual({ strongs: 'G1722', num: 1722, compound: false });
  });
  it('returns undefined for missing or malformed values', () => {
    expect(parseMaculaStrongs(undefined, 'H')).toBeUndefined();
    expect(parseMaculaStrongs('abc', 'G')).toBeUndefined();
  });
});

describe('normalizeRole', () => {
  it('accepts every documented role code', () => {
    for (const r of ['s', 'v', 'vc', 'o', 'io', 'o2', 'p', 'pp', 'adv', 'aux']) {
      expect(KNOWN_ROLES.has(r)).toBe(true);
      expect(normalizeRole(r)).toBe(r);
    }
  });
  it('rejects upstream error strings and unknown codes', () => {
    expect(normalizeRole('err__subordinated simple cl., parent rule: ClCl')).toBeUndefined();
    expect(normalizeRole('subject')).toBeUndefined();
    expect(normalizeRole(undefined)).toBeUndefined();
  });
});

describe('classifyNegator', () => {
  it('recognizes Hebrew tree-marked negative particles', () => {
    expect(classifyNegator({ type: 'negative', morph: 'Tn' }, 'H')).toBe('particle');
    expect(classifyNegator({ type: 'affirmation' }, 'H')).toBeNull();
  });
  it('recognizes the whole Robinson -N family, not just PRT-N', () => {
    expect(classifyNegator({ morph: 'PRT-N', class: 'adv' }, 'G')).toBe('particle');
    expect(classifyNegator({ morph: 'ADV-N', class: 'adv' }, 'G')).toBe('particle');
    expect(classifyNegator({ morph: 'CONJ-N', class: 'conj' }, 'G')).toBe('particle');
    expect(classifyNegator({ morph: 'A-NSM-N', class: 'adj' }, 'G')).toBe('nominal');
  });
  it('does not treat ordinary morphs as negators', () => {
    expect(classifyNegator({ morph: 'N-NSM', class: 'noun' }, 'G')).toBeNull();
    expect(classifyNegator({ morph: 'V-PAI-3S', class: 'verb' }, 'G')).toBeNull();
  });
});

describe('parseTerm (bible syntax query values)', () => {
  it("parses Strong's numbers case-insensitively", () => {
    expect(parseTerm('H2142')).toMatchObject({ kind: 'strongs', lang: 'H', num: 2142 });
    expect(parseTerm('g25')).toMatchObject({ kind: 'strongs', lang: 'G', num: 25 });
  });
  it('keeps an exact dStrong key when a suffix is given', () => {
    expect(parseTerm('H1886a')).toMatchObject({ kind: 'strongs', strongs: 'H1886a' });
  });
  it('normalizes pointed Hebrew lemmas to consonants', () => {
    expect(parseTerm('אֱלֹהִים')).toMatchObject({ kind: 'lemma', norm: 'אלהים' });
  });
  it('folds Greek diacritics and final sigma', () => {
    expect(parseTerm('λόγος')).toMatchObject({ kind: 'lemma', norm: 'λογοσ' });
    expect(parseTerm('Ἰησοῦς')).toMatchObject({ kind: 'lemma', norm: 'ιησουσ' });
  });
});
