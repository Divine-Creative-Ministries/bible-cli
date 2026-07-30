import { describe, expect, it } from 'vitest';
import { parseTsvLine, validateTranslationId } from '../src/commands/import.js';
import { parseUsfm } from '../src/parsers/usfm.js';

describe('validateTranslationId', () => {
  const shipped = ['WEB', 'KJV', 'ASV', 'BSB'];
  it('uppercases and accepts sane ids', () => {
    expect(validateTranslationId('esv', shipped)).toBe('ESV');
    expect(validateTranslationId('NIV84', shipped)).toBe('NIV84');
  });
  it('rejects shipped ids', () => {
    expect(() => validateTranslationId('bsb', shipped)).toThrowError(/shipped/);
  });
  it('rejects malformed ids', () => {
    expect(() => validateTranslationId('X', shipped)).toThrowError();
    expect(() => validateTranslationId('MY TRANSLATION', shipped)).toThrowError();
    expect(() => validateTranslationId('9AB', shipped)).toThrowError();
  });
});

describe('parseTsvLine', () => {
  it('parses a verse line', () => {
    const r = parseTsvLine('John 3:16\tFor God so loved the world', 1)!;
    expect(r.verse_id).toBe(43003016);
    expect(r.text).toBe('For God so loved the world');
  });
  it('skips blanks and comments', () => {
    expect(parseTsvLine('', 1)).toBeNull();
    expect(parseTsvLine('# a comment', 2)).toBeNull();
  });
  it('rejects lines without a tab', () => {
    expect(() => parseTsvLine('John 3:16 For God', 3)).toThrowError(/TAB/);
  });
  it('rejects multi-verse references', () => {
    expect(() => parseTsvLine('John 3:16-18\ttext', 4)).toThrowError(/single verse/);
  });
});

describe('parseUsfm (shared runtime parser)', () => {
  it('extracts verses, titles, and bridges', () => {
    const usfm = [
      '\\id PSA Some Translation',
      '\\c 23',
      '\\d A Psalm of David.',
      '\\q1',
      '\\v 1 The LORD is my shepherd; I shall not want.',
      '\\v 2-3 He makes me lie down. He restores my soul.',
    ].join('\n');
    const { bookId, verses } = parseUsfm(usfm);
    expect(bookId).toBe('PSA');
    expect(verses).toEqual([
      { chapter: 23, verse: 0, text: 'A Psalm of David.' },
      { chapter: 23, verse: 1, text: 'The LORD is my shepherd; I shall not want.' },
      { chapter: 23, verse: 2, endVerse: 3, text: 'He makes me lie down. He restores my soul.' },
    ]);
  });
});
