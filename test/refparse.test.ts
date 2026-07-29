import { describe, expect, it } from 'vitest';
import { parseRef, parseScope, RefError } from '../src/refparse/index.js';

describe('parseRef', () => {
  const cases: Array<[string, number, number]> = [
    ['John 3:16', 43003016, 43003016],
    ['john 3:16', 43003016, 43003016],
    ['jn 3 16', 43003016, 43003016],
    ['jn3.16', 43003016, 43003016],
    ['JHN 3:16', 43003016, 43003016],
    ['John 3:16-18', 43003016, 43003018],
    ['John 3:16–18', 43003016, 43003018], // en dash
    ['Gen 1:1-2:3', 1001001, 1002003],
    ['Genesis 1-3', 1001000, 1003999],
    ['Psalm 23', 19023000, 19023999],
    ['psa 51:title', 19051000, 19051000],
    ['1jn2:5', 62002005, 62002005],
    ['1 John 2:5', 62002005, 62002005],
    ['I John 2:5', 62002005, 62002005],
    ['First John 2:5', 62002005, 62002005],
    ['Jude 5', 65001005, 65001005], // single-chapter book: bare number = verse
    ['Obadiah 15', 31001015, 31001015],
    ['Philemon 6', 57001006, 57001006],
    ['Song of Solomon 2:1', 22002001, 22002001],
    ['Canticles 2:1', 22002001, 22002001],
    ['song 2:1', 22002001, 22002001],
    ['2 Sam 7:12-16', 10007012, 10007016],
    ['Rev 22:21', 66022021, 66022021],
  ];
  for (const [input, start, end] of cases) {
    it(`parses '${input}'`, () => {
      const r = parseRef(input);
      expect(r.start).toBe(start);
      expect(r.end).toBe(end);
    });
  }

  it('parses a whole book', () => {
    const r = parseRef('Romans');
    expect(r.kind).toBe('book');
    expect(r.start).toBe(45001000);
    expect(r.end).toBe(45016999);
  });

  it('rejects unknown books with suggestions', () => {
    expect(() => parseRef('Pslams 23')).toThrowError(RefError);
    try {
      parseRef('Pslams 23');
    } catch (e) {
      expect((e as RefError).suggestions).toContain('Psalms');
    }
  });

  it('rejects out-of-range chapters', () => {
    expect(() => parseRef('John 99')).toThrowError(/21 chapter/);
  });

  it('rejects reversed ranges', () => {
    expect(() => parseRef('John 3:18-16')).toThrowError(RefError);
  });
});

describe('parseScope', () => {
  it('handles testaments', () => {
    expect(parseScope('ot')[0]).toMatchObject({ start: 1_000_000, end: 39_999_999 });
    expect(parseScope('NT')[0]).toMatchObject({ start: 40_000_000, end: 66_999_999 });
  });
  it('handles book ranges', () => {
    const s = parseScope('Gen-Deu')[0]!;
    expect(s.start).toBe(1_000_000);
    expect(s.end).toBe(5_999_999);
  });
  it('handles single books', () => {
    const s = parseScope('Isaiah')[0]!;
    expect(s.start).toBe(23001000);
    expect(s.end).toBe(23066999);
  });
});
