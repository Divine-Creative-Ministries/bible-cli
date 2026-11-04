/**
 * Plain-English labels for decoded Hebrew/Greek morphology, as stored in the
 * study database's `words` columns (pos, person, gender, number_, gcase,
 * tense, voice, mood, stem, state, degree).
 */

export interface ParsingParts {
  pos?: string | null;
  person?: string | null;
  gender?: string | null;
  number?: string | null;
  gcase?: string | null;
  tense?: string | null;
  voice?: string | null;
  mood?: string | null;
  stem?: string | null;
  state?: string | null;
  degree?: string | null;
}

const ORD: Record<string, string> = { '1': '1st person', '2': '2nd person', '3': '3rd person' };

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const words = (s: string): string => s.replace(/-/g, ' ');

/**
 * "Aorist · active · imperative · 2nd person plural" (Greek verb),
 * "Qal · perfect · 3rd person masculine singular" (Hebrew verb),
 * "Noun · feminine singular · absolute" (Hebrew noun).
 */
export function parsingLabel(p: ParsingParts): string {
  const parts: string[] = [];
  const pgn = [p.person ? ORD[p.person] ?? p.person : null, p.gender, p.number].filter(Boolean).join(' ');
  if (p.pos === 'verb') {
    if (p.stem) parts.push(words(p.stem));
    if (p.tense) parts.push(words(p.tense));
    if (p.voice) parts.push(words(p.voice));
    if (p.mood) parts.push(words(p.mood));
    if (p.gcase) parts.push(p.gcase);
    if (pgn) parts.push(pgn);
    if (parts.length === 0) parts.push('verb');
  } else {
    if (p.pos) parts.push(words(p.pos));
    if (p.gcase) parts.push(p.gcase);
    if (pgn) parts.push(pgn);
    if (p.state) parts.push(p.state);
    if (p.degree) parts.push(p.degree);
  }
  return parts.length ? cap(parts.join(' · ')) : '';
}

/** Short part-of-speech label for list rows ("verb", "noun"). */
export function posLabel(pos: string | null | undefined): string {
  return pos ? words(pos) : '';
}
