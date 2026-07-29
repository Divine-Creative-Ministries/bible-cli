/**
 * Decomposer for OpenScriptures Hebrew Morphology (OSHM) codes as used by
 * STEPBible TAHOT, e.g. 'HVqp3ms', 'HR/Ncfsa', 'HTd/Ncmpa', 'ANmsd'.
 * The language letter (H/A) prefixes the whole word; morphemes split on '/'.
 */

export interface MorphParts {
  pos: string | null;
  person: string | null;
  gender: string | null;
  number: string | null;
  gcase: string | null;
  tense: string | null;
  voice: string | null;
  mood: string | null;
  stem: string | null;
  state: string | null;
  degree: string | null;
}

export const emptyParts = (): MorphParts => ({
  pos: null,
  person: null,
  gender: null,
  number: null,
  gcase: null,
  tense: null,
  voice: null,
  mood: null,
  stem: null,
  state: null,
  degree: null,
});

const POS: Record<string, string> = {
  A: 'adjective',
  C: 'conjunction',
  D: 'adverb',
  N: 'noun',
  P: 'pronoun',
  R: 'preposition',
  S: 'suffix',
  T: 'particle',
  V: 'verb',
};

const HEBREW_STEMS: Record<string, string> = {
  q: 'qal', N: 'niphal', p: 'piel', P: 'pual', h: 'hiphil', H: 'hophal', t: 'hithpael',
  o: 'polel', O: 'polal', r: 'hithpolel', m: 'poel', M: 'poal', k: 'palel', K: 'pulal',
  Q: 'qal-passive', l: 'pilpel', L: 'polpal', f: 'hithpalpel', D: 'nithpael', j: 'pealal',
  i: 'pilel', u: 'hothpaal', c: 'tiphil', v: 'hishtaphel', w: 'nithpalel', y: 'nithpoel',
  z: 'hithpoel',
};

const ARAMAIC_STEMS: Record<string, string> = {
  q: 'peal', Q: 'peil', u: 'hithpeel', p: 'pael', P: 'ithpaal', M: 'hithpaal', a: 'aphel',
  h: 'haphel', s: 'saphel', e: 'shaphel', H: 'hophal', i: 'ithpeel', t: 'hishtaphel',
  v: 'ishtaphel', w: 'hithaphel', o: 'polel', z: 'ithpoel', r: 'hithpolel', f: 'hithpalpel',
  b: 'hephal', c: 'tiphel', m: 'poel', l: 'palpel', L: 'ithpalpel', O: 'ithpolel', G: 'ittaphal',
};

const CONJUGATIONS: Record<string, string> = {
  p: 'perfect',
  q: 'sequential-perfect',
  i: 'imperfect',
  w: 'wayyiqtol',
  h: 'cohortative',
  j: 'jussive',
  v: 'imperative',
  r: 'participle',
  s: 'participle-passive',
  a: 'infinitive-absolute',
  c: 'infinitive-construct',
  // TAHOT/TEHMC extensions beyond base OSHM:
  u: 'weyiqtol', // conjunction + imperfect
  n: 'imperfect', // imperfect, indicative-only form
};

const GENDER: Record<string, string> = { m: 'masculine', f: 'feminine', b: 'both', c: 'common' };
const NUMBER: Record<string, string> = { s: 'singular', p: 'plural', d: 'dual' };
const STATE: Record<string, string> = { a: 'absolute', c: 'construct', d: 'determined' };
const PERSON: Record<string, string> = { '1': '1', '2': '2', '3': '3' };

export class MorphError extends Error {}

/** Decompose a single morpheme code (without language prefix). */
export function parseOshmMorpheme(code: string, lang: 'H' | 'A'): MorphParts {
  const p = emptyParts();
  if (!code) return p;
  const posChar = code[0]!;
  const pos = POS[posChar];
  if (!pos) throw new MorphError(`Unknown OSHM part of speech '${posChar}' in '${code}'`);
  p.pos = pos;
  const rest = code.slice(1);

  switch (posChar) {
    case 'V': {
      const stemChar = rest[0];
      if (stemChar) {
        const stems = lang === 'A' ? ARAMAIC_STEMS : HEBREW_STEMS;
        const stem = stems[stemChar];
        if (!stem) throw new MorphError(`Unknown ${lang} stem '${stemChar}' in '${code}'`);
        p.stem = stem;
      }
      const conjChar = rest[1];
      if (conjChar) {
        const conj = CONJUGATIONS[conjChar];
        if (!conj) throw new MorphError(`Unknown conjugation '${conjChar}' in '${code}'`);
        p.tense = conj;
        const tail = rest.slice(2);
        if (conj === 'participle' || conj === 'participle-passive') {
          if (tail[0]) p.gender = GENDER[tail[0]] ?? null;
          if (tail[1]) p.number = NUMBER[tail[1]] ?? null;
          if (tail[2]) p.state = STATE[tail[2]] ?? null;
        } else {
          if (tail[0]) p.person = PERSON[tail[0]] ?? null;
          if (tail[1]) p.gender = GENDER[tail[1]] ?? null;
          if (tail[2]) p.number = NUMBER[tail[2]] ?? null;
        }
      }
      return p;
    }
    case 'N':
    case 'A': {
      // type char then gender number state; proper nouns may omit trailing parts
      const tail = rest.slice(1);
      if (tail[0]) p.gender = GENDER[tail[0]] ?? null;
      if (tail[1]) p.number = NUMBER[tail[1]] ?? null;
      if (tail[2]) p.state = STATE[tail[2]] ?? null;
      return p;
    }
    case 'P': {
      const tail = rest.slice(1);
      if (tail[0]) p.person = PERSON[tail[0]] ?? null;
      if (tail[0] && !PERSON[tail[0]]) p.gender = GENDER[tail[0]] ?? null;
      if (tail[1]) p.gender = p.gender ?? (GENDER[tail[1]] ?? null);
      const numChar = tail[2] ?? tail[1];
      if (numChar) p.number = NUMBER[numChar] ?? p.number ?? null;
      return p;
    }
    case 'S': {
      const tail = rest.slice(1);
      if (tail[0]) p.person = PERSON[tail[0]] ?? null;
      if (tail[1]) p.gender = GENDER[tail[1]] ?? null;
      if (tail[2]) p.number = NUMBER[tail[2]] ?? null;
      return p;
    }
    default:
      return p; // C, D, R, T carry no further decomposition we expose
  }
}
