import { describe, expect, it } from 'vitest';
import { segments, tokenize } from '../pipeline/stages/alignment.js';

describe('BSB table rendering markup', () => {
  it('splits supplied words', () => {
    expect(segments(' and I {will remain} ')).toEqual([
      { text: 'and I', supplied: false },
      { text: 'will remain', supplied: true },
    ]);
    expect(segments(' neither [can] ')).toEqual([
      { text: 'neither', supplied: false },
      { text: 'can', supplied: true },
    ]);
  });
  it('strips embedded paragraph markup and continuation dots', () => {
    expect(segments(' Rejoice, [O heavens, with Him, <p class=|indent2|>and let all] ').map((s) => s.text)).toEqual([
      'Rejoice,',
      'O heavens, with Him, and let all',
    ]);
    expect(segments(' ... for this reason ')).toEqual([{ text: 'for this reason', supplied: false }]);
  });
  it('tokenizes with offsets and normalized apostrophes', () => {
    const t = tokenize('“God’s word,” he said.');
    expect(t.map((x) => x.norm)).toEqual(["god's", 'word', 'he', 'said']);
    expect(t[0]).toMatchObject({ start: 1, end: 6 });
  });
});
