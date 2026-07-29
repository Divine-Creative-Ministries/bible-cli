import { describe, expect, it } from 'vitest';
import { parseOshmMorpheme, MorphError } from '../pipeline/morph/oshm.js';
import { parseRobinson } from '../pipeline/morph/robinson.js';

describe('OSHM Hebrew decomposer', () => {
  it('parses a qal perfect verb', () => {
    const p = parseOshmMorpheme('Vqp3ms', 'H');
    expect(p).toMatchObject({ pos: 'verb', stem: 'qal', tense: 'perfect', person: '3', gender: 'masculine', number: 'singular' });
  });
  it('parses a wayyiqtol', () => {
    const p = parseOshmMorpheme('Vqw3ms', 'H');
    expect(p.tense).toBe('wayyiqtol');
  });
  it('parses the TAHOT weyiqtol extension', () => {
    const p = parseOshmMorpheme('Vqu3mp', 'H');
    expect(p.tense).toBe('weyiqtol');
    expect(p.number).toBe('plural');
  });
  it('parses a niphal participle with state', () => {
    const p = parseOshmMorpheme('VNrmsa', 'H');
    expect(p).toMatchObject({ pos: 'verb', stem: 'niphal', tense: 'participle', gender: 'masculine', number: 'singular', state: 'absolute' });
  });
  it('parses nouns with state', () => {
    const p = parseOshmMorpheme('Ncfsa', 'H');
    expect(p).toMatchObject({ pos: 'noun', gender: 'feminine', number: 'singular', state: 'absolute' });
  });
  it('parses construct state', () => {
    expect(parseOshmMorpheme('Ncmsc', 'H').state).toBe('construct');
  });
  it('parses pronominal suffixes', () => {
    const p = parseOshmMorpheme('Sp2ms', 'H');
    expect(p).toMatchObject({ pos: 'suffix', person: '2', gender: 'masculine', number: 'singular' });
  });
  it('parses Aramaic stems by language', () => {
    expect(parseOshmMorpheme('Vqp3ms', 'A').stem).toBe('peal');
    expect(parseOshmMorpheme('Vhp3ms', 'A').stem).toBe('haphel');
    expect(parseOshmMorpheme('Vhp3ms', 'H').stem).toBe('hiphil');
  });
  it('throws on unknown POS', () => {
    expect(() => parseOshmMorpheme('Zxx', 'H')).toThrowError(MorphError);
  });
});

describe('Robinson Greek decomposer', () => {
  it('parses a present active indicative', () => {
    const p = parseRobinson('V-PAI-3S');
    expect(p).toMatchObject({ pos: 'verb', tense: 'present', voice: 'active', mood: 'indicative', person: '3', number: 'singular' });
  });
  it('parses second aorist forms', () => {
    const p = parseRobinson('V-2AAI-3S');
    expect(p).toMatchObject({ tense: 'aorist', voice: 'active', mood: 'indicative' });
  });
  it('parses participles with case-number-gender', () => {
    const p = parseRobinson('V-PAP-NSM');
    expect(p).toMatchObject({ mood: 'participle', gcase: 'nominative', number: 'singular', gender: 'masculine' });
  });
  it('parses aorist passive imperative', () => {
    const p = parseRobinson('V-APM-2S');
    expect(p).toMatchObject({ tense: 'aorist', voice: 'passive', mood: 'imperative', person: '2' });
  });
  it('parses nouns', () => {
    const p = parseRobinson('N-GSF');
    expect(p).toMatchObject({ pos: 'noun', gcase: 'genitive', number: 'singular', gender: 'feminine' });
  });
  it('parses proper-noun suffix flags', () => {
    const p = parseRobinson('N-GSM-P');
    expect(p).toMatchObject({ pos: 'noun', gcase: 'genitive', gender: 'masculine' });
  });
  it('parses articles', () => {
    expect(parseRobinson('T-NPM')).toMatchObject({ pos: 'article', gcase: 'nominative', number: 'plural' });
  });
  it('parses personal pronouns with person', () => {
    const p = parseRobinson('P-1GS');
    expect(p).toMatchObject({ pos: 'pronoun', person: '1', gcase: 'genitive', number: 'singular' });
  });
  it('parses indeclinables', () => {
    expect(parseRobinson('ADV').pos).toBe('adverb');
    expect(parseRobinson('CONJ').pos).toBe('conjunction');
    expect(parseRobinson('PREP').pos).toBe('preposition');
    expect(parseRobinson('N-PRI').pos).toBe('noun');
  });
  it('throws on garbage', () => {
    expect(() => parseRobinson('ZZZ-9')).toThrowError(MorphError);
  });
});
