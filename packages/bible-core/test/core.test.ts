import { describe, expect, it } from 'vitest';
import { formatRange, parseRef, parsingLabel, chapterUnits, resolveScope, chunkChapters, planDays } from '../src/index.js';

describe('formatRange', () => {
  it.each([
    [43003016, 43003016, 'John 3:16'],
    [43015004, 43015005, 'John 15:4–5'],
    [1001001, 1002003, 'Genesis 1:1–2:3'],
    [43015000, 43015999, 'John 15'],
    [23040000, 23055999, 'Isaiah 40–55'],
    [65001000, 65001999, 'Jude'],
    [19003000, 19003000, 'Psalms 3:title'],
  ])('%i–%i → %s', (a, z, want) => expect(formatRange(a, z)).toBe(want));

  it('round-trips through parseRef', () => {
    for (const ref of ['John 15:4–5', 'Genesis 1:1–2:3', 'Isaiah 40–55', 'John 3:16']) {
      const p = parseRef(ref);
      expect(formatRange(p.start, p.end)).toBe(ref);
    }
  });
});

describe('parsingLabel', () => {
  it('labels a Greek imperative', () => {
    expect(parsingLabel({ pos: 'verb', person: '2', number: 'plural', tense: 'aorist', voice: 'active', mood: 'imperative' }))
      .toBe('Aorist · active · imperative · 2nd person plural');
  });
  it('labels a Hebrew qal perfect', () => {
    expect(parsingLabel({ pos: 'verb', person: '3', gender: 'masculine', number: 'singular', tense: 'perfect', stem: 'qal' }))
      .toBe('Qal · perfect · 3rd person masculine singular');
  });
  it('labels a Hebrew noun', () => {
    expect(parsingLabel({ pos: 'noun', gender: 'feminine', number: 'singular', state: 'absolute' }))
      .toBe('Noun · feminine singular · absolute');
  });
});

describe('units', () => {
  it('builds chapter units for Isaiah 40–55 and a pace', () => {
    const u = chapterUnits(resolveScope('Isaiah 40-55'));
    expect(u).toHaveLength(16);
    expect(u[0]!.label).toBe('Isaiah 40');
    expect(planDays(u.length, 1)).toBe(16);
  });
  it('packs chunks without splitting chapters', () => {
    const chs = [1, 2, 3, 4].map((c) => ({ bookNum: 43, chapter: c, chars: 1000 }));
    expect(chunkChapters(chs, 2500).map((c) => c.length)).toEqual([2, 2]);
  });
});

describe('refparse errors', () => {
  it('pluralises chapter counts', () => {
    expect(() => parseRef('John 22')).toThrow('John has 21 chapters; got chapter 22.');
    expect(() => parseRef('Jude 2:1')).toThrow('Jude has 1 chapter; got chapter 2.');
  });
});
