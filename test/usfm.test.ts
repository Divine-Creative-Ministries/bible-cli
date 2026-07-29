import { describe, expect, it } from 'vitest';
import { cleanText, parseUsfm } from '../pipeline/parsers/usfm.js';

describe('cleanText', () => {
  it('strips word-level Strong tagging', () => {
    expect(cleanText('\\w In|strong="H8064"\\w* \\w the|strong="H1254"\\w* beginning')).toBe('In the beginning');
  });
  it('strips footnotes completely', () => {
    expect(cleanText('born\\f + \\fr 1:18 \\ft a note about “words”.\\f* Son')).toBe('born Son');
  });
  it('strips cross-references', () => {
    expect(cleanText('written, “Zeal”\\x + \\xo 2:17 \\xt Psalms 69:9\\x* more')).toBe('written, “Zeal” more');
  });
  it('keeps \\add text without leaving an asterisk', () => {
    expect(cleanText('seed, \\add and\\add* fruit-trees')).toBe('seed, and fruit-trees');
  });
  it('keeps nested \\+w inside \\wj', () => {
    expect(cleanText('\\wj “\\+w Take|strong="G2532"\\+w* \\+w these|strong="G3778"\\+w*!”\\wj*')).toBe('“Take these!”');
  });
});

describe('parseUsfm', () => {
  const sample = `\\id PSA Test
\\c 3
\\d A Psalm of David, when he fled.
\\q1
\\v 1 Yahweh, how my adversaries have increased!
\\q2 Many are they who rise up against me.
\\v 2-3 Many there are who say of my soul,
\\c 4
\\s1 A heading to ignore
\\q1
\\v 1 Answer me when I call, God.`;

  it('extracts titles, verses, bridges, chapters', () => {
    const { bookId, verses } = parseUsfm(sample);
    expect(bookId).toBe('PSA');
    expect(verses).toEqual([
      { chapter: 3, verse: 0, text: 'A Psalm of David, when he fled.' },
      { chapter: 3, verse: 1, text: 'Yahweh, how my adversaries have increased! Many are they who rise up against me.' },
      { chapter: 3, verse: 2, endVerse: 3, text: 'Many there are who say of my soul,' },
      { chapter: 4, verse: 1, text: 'Answer me when I call, God.' },
    ]);
  });
});
