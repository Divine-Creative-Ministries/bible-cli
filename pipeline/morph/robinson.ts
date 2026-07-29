/**
 * Decomposer for Robinson-style Greek morphology codes as used by STEPBible
 * TAGNT, e.g. 'N-NSF', 'V-PAI-3S', 'V-2AAI-3S', 'N-GSM-P', 'P-1GS', 'ADV'.
 */

import { MorphParts, MorphError, emptyParts } from './oshm.js';

const POS: Record<string, string> = {
  N: 'noun',
  A: 'adjective',
  T: 'article',
  V: 'verb',
  P: 'pronoun', // personal
  R: 'pronoun', // relative
  C: 'pronoun', // reciprocal
  D: 'pronoun', // demonstrative
  K: 'pronoun', // correlative
  I: 'pronoun', // interrogative
  X: 'pronoun', // indefinite
  Q: 'pronoun', // correlative/interrogative
  F: 'pronoun', // reflexive
  S: 'pronoun', // possessive
  ADV: 'adverb',
  CONJ: 'conjunction',
  COND: 'conditional',
  PRT: 'particle',
  PREP: 'preposition',
  INJ: 'interjection',
  ARAM: 'aramaic-word',
  HEB: 'hebrew-word',
  'N-PRI': 'noun',
  'A-NUI': 'adjective',
  'N-LI': 'noun',
  'N-OI': 'noun',
};

const TENSE: Record<string, string> = {
  P: 'present',
  I: 'imperfect',
  F: 'future',
  A: 'aorist',
  R: 'perfect',
  L: 'pluperfect',
  X: 'unstated',
};

const VOICE: Record<string, string> = {
  A: 'active',
  M: 'middle',
  P: 'passive',
  E: 'middle-passive',
  D: 'middle', // deponent
  O: 'passive', // deponent
  N: 'middle-passive', // deponent
  Q: 'active', // impersonal active
  X: 'unstated',
};

const MOOD: Record<string, string> = {
  I: 'indicative',
  S: 'subjunctive',
  O: 'optative',
  M: 'imperative',
  N: 'infinitive',
  P: 'participle',
  R: 'imperative-participle',
};

const CASE: Record<string, string> = {
  N: 'nominative',
  G: 'genitive',
  D: 'dative',
  A: 'accusative',
  V: 'vocative',
};

const NUMBER: Record<string, string> = { S: 'singular', P: 'plural' };
const GENDER: Record<string, string> = { M: 'masculine', F: 'feminine', N: 'neuter' };

/** Parse case-number-gender triple like 'NSF' or 'MNSM' (with leading person). */
function parseCNG(p: MorphParts, seg: string): void {
  let s = seg;
  if (s[0] && /[123]/.test(s[0])) {
    p.person = s[0]!;
    s = s.slice(1);
  }
  if (s[0] && CASE[s[0]]) {
    p.gcase = CASE[s[0]]!;
    s = s.slice(1);
  }
  if (s[0] && NUMBER[s[0]]) {
    p.number = NUMBER[s[0]]!;
    s = s.slice(1);
  }
  if (s[0] && GENDER[s[0]]) {
    p.gender = GENDER[s[0]]!;
    s = s.slice(1);
  }
}

const SUFFIX_FLAGS = new Set([
  'P', 'T', 'L', 'G', 'PG', 'ATT', 'N', 'K', 'ABB', 'C', 'S', 'I', 'M', 'ARAM', 'HEB',
]);

export function parseRobinson(code: string): MorphParts {
  const p = emptyParts();
  const segs = code.trim().split('-').filter(Boolean);
  if (segs.length === 0) throw new MorphError(`Empty Robinson code '${code}'`);

  // Indeclinable compound tags first
  const two = segs.slice(0, 2).join('-');
  if (POS[two] && ['N-PRI', 'A-NUI', 'N-LI', 'N-OI'].includes(two)) {
    p.pos = POS[two]!;
    return p;
  }

  const head = segs[0]!;
  const pos = POS[head];
  if (!pos) throw new MorphError(`Unknown Robinson POS '${head}' in '${code}'`);
  p.pos = pos;

  if (['ADV', 'CONJ', 'COND', 'PRT', 'PREP', 'INJ', 'ARAM', 'HEB'].includes(head)) {
    if (segs[1] === 'C') p.degree = 'comparative';
    if (segs[1] === 'S') p.degree = 'superlative';
    return p;
  }

  if (head === 'V') {
    // segs[1] = [2]TVM ; segs[2] = person+number (finite) or CNG (participle)
    let tvm = segs[1] ?? '';
    if (tvm[0] === '2') tvm = tvm.slice(1); // second aorist etc.
    const [t, v, m] = [tvm[0], tvm[1], tvm[2]];
    if (t) {
      if (!TENSE[t]) throw new MorphError(`Unknown tense '${t}' in '${code}'`);
      p.tense = TENSE[t]!;
    }
    if (v) {
      if (!VOICE[v]) throw new MorphError(`Unknown voice '${v}' in '${code}'`);
      p.voice = VOICE[v]!;
    }
    if (m) {
      if (!MOOD[m]) throw new MorphError(`Unknown mood '${m}' in '${code}'`);
      p.mood = MOOD[m]!;
    }
    const tail = segs[2];
    if (tail && !SUFFIX_FLAGS.has(tail)) {
      if (p.mood === 'participle' || p.mood === 'imperative-participle') parseCNG(p, tail);
      else {
        if (tail[0] && /[123]/.test(tail[0])) p.person = tail[0]!;
        if (tail[1]) p.number = NUMBER[tail[1]] ?? null;
      }
    }
    return p;
  }

  // Nominals & pronouns: next segment is (person+)case-number-gender
  const seg1 = segs[1];
  if (seg1 && !SUFFIX_FLAGS.has(seg1)) {
    // Possessive pronouns: e.g. S-1SGSM = possessor person+number, then CNG
    if (head === 'S' && /^[123][SP]/.test(seg1)) {
      p.person = seg1[0]!;
      parseCNG(p, seg1.slice(2));
    } else {
      parseCNG(p, seg1);
    }
  }
  // Comparative/superlative markers
  if (segs.includes('C')) p.degree = 'comparative';
  if (segs.includes('S') && head === 'A') p.degree = 'superlative';
  return p;
}
