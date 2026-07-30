/**
 * Clause-level syntax search over the MACULA treebanks (bible-syntax.db):
 * "who did what to whom" — subject/verb/object/negation constraints resolved
 * against tree-annotated clause roles rather than word proximity.
 */
import type { Command } from 'commander';
import { byBookNum, formatVerseId, splitVerseId } from '../canon.js';
import { openSyntax } from '../db/index.js';
import { emit, fail } from '../output.js';
import { parseScope, RefError } from '../refparse/index.js';
import { DEFAULT_TRANSLATION, intOpt, versesFor } from './read.js';

/** Roles a friendly constraint name expands to. */
const ROLE_SETS: Record<string, string[]> = {
  subject: ['s'],
  verb: ['v', 'vc'],
  object: ['o', 'o2'],
  any: ['s', 'v', 'vc', 'o', 'io', 'o2', 'p', 'pp', 'adv', 'aux'],
};

interface Term {
  kind: 'strongs' | 'lemma';
  lang?: 'H' | 'G'; // strongs only
  num?: number;
  strongs?: string; // exact dStrong key when a suffix was given
  norm?: string; // normalized lemma
  raw: string;
}

/** 'H2142' / 'G25' / 'g0026a' -> strongs term; anything else -> lemma term. */
export function parseTerm(input: string): Term {
  const m = input.trim().match(/^([HGhg])(\d{1,4})([A-Za-z]?)$/);
  if (m) {
    const lang = m[1]!.toUpperCase() as 'H' | 'G';
    const num = parseInt(m[2]!, 10);
    return {
      kind: 'strongs',
      lang,
      num,
      ...(m[3] ? { strongs: `${lang}${String(num).padStart(4, '0')}${m[3]!.toLowerCase()}` } : {}),
      raw: input,
    };
  }
  // Lemma: normalize the same way the pipeline does (strip Hebrew pointing /
  // Greek diacritics, fold final sigma, lowercase).
  const norm = input
    .normalize('NFD')
    .replace(/[֑-ׇ̀-ͯ᪰-᫿]/g, '')
    .replace(/ς/g, 'σ')
    .toLowerCase()
    .normalize('NFC')
    .replace(/־/g, ' ')
    .trim();
  return { kind: 'lemma', norm, raw: input };
}

interface RoleRow {
  clause_id: number;
  role: string;
  verse_id: number;
  word_pos: number;
  surface: string;
  lemma: string | null;
  strongs: string | null;
  negated: number;
}

interface ClauseRow {
  clause_id: number;
  verse_start: number;
  verse_end: number;
  lang: string;
  kind: string | null;
  rule: string | null;
  negated: number;
}

function refRange(start: number, end: number): string {
  if (start === end) return formatVerseId(start);
  const a = splitVerseId(start);
  const z = splitVerseId(end);
  if (a.bookNum === z.bookNum && a.chapter === z.chapter) return `${formatVerseId(start)}-${z.verse}`;
  return `${formatVerseId(start)} – ${formatVerseId(end)}`;
}

export function registerSyntaxCommand(program: Command): void {
  program
    .command('syntax')
    .description(
      'Clause search over the MACULA treebanks: who did what to whom. Examples: bible syntax --subject H430 --verb H2142 · bible syntax --verb G4100 --negated',
    )
    .option('--subject <q>', "Strong's number or lemma that must appear in the clause's subject")
    .option('--verb <q>', "Strong's number or lemma of the clause's verb (or copula)")
    .option('--object <q>', "Strong's number or lemma in the clause's (direct or second) object")
    .option('--role-any <q>', "Strong's number or lemma appearing in any role of the clause")
    .option('--negated', 'only clauses the trees mark as negated (Hebrew לא/אל/אין, Greek οὐ/μή family)')
    .option('-b, --book <scope>', "limit scope: book, range, 'ot', 'nt'")
    .option('-l, --limit <n>', 'max clauses listed (default 20)', intOpt, 20)
    .option('--json', 'output JSON')
    .action((opts: { subject?: string; verb?: string; object?: string; roleAny?: string; negated?: boolean; book?: string; limit: number; json?: boolean }) => {
      const constraints: Array<{ roles: string[]; term: Term; isVerb: boolean }> = [];
      for (const [optName, roleKey] of [
        ['subject', 'subject'],
        ['verb', 'verb'],
        ['object', 'object'],
        ['roleAny', 'any'],
      ] as const) {
        const v = opts[optName];
        if (v) constraints.push({ roles: ROLE_SETS[roleKey]!, term: parseTerm(v), isVerb: roleKey === 'verb' });
      }
      if (constraints.length === 0 && !opts.negated) {
        fail(opts, 'Give at least one constraint: --subject, --verb, --object, --role-any, or --negated. Example: bible syntax --subject H430 --verb H2142');
      }

      const db = openSyntax();
      const conds: string[] = [];
      const args: unknown[] = [];
      for (const c of constraints) {
        const parts: string[] = [`r.role IN (${c.roles.map(() => '?').join(',')})`];
        const sub: unknown[] = [...c.roles];
        if (c.term.kind === 'strongs') {
          if (c.term.strongs) {
            parts.push('r.strongs = ?');
            sub.push(c.term.strongs);
          } else {
            parts.push('r.strongs_num = ?');
            sub.push(c.term.num);
          }
        } else {
          parts.push('(r.lemma_norm = ? OR r.lemma = ?)');
          sub.push(c.term.norm, c.term.raw);
        }
        if (c.isVerb && opts.negated) parts.push('r.negated = 1');
        conds.push(`EXISTS (SELECT 1 FROM syntax.clause_roles r WHERE r.clause_id = c.clause_id AND ${parts.join(' AND ')})`);
        args.push(...sub);
        // Strong's language implies the clause language (H numbers can collide with G numbers).
        if (c.term.kind === 'strongs') {
          conds.push(c.term.lang === 'H' ? "c.lang IN ('H','A')" : "c.lang = 'G'");
        }
      }
      if (opts.negated) conds.push('c.negated = 1');
      if (opts.book) {
        try {
          const scope = parseScope(opts.book);
          conds.push('(' + scope.map(() => 'c.verse_start BETWEEN ? AND ?').join(' OR ') + ')');
          args.push(...scope.flatMap((s) => [s.start, s.end]));
        } catch (e) {
          if (e instanceof RefError) fail(opts, e.message);
          throw e;
        }
      }
      const where = conds.join(' AND ');

      const total = (db.prepare(`SELECT COUNT(*) n FROM syntax.clauses c WHERE ${where}`).get(...args) as { n: number }).n;
      if (total === 0) {
        fail(opts, 'No clauses match those constraints. Loosen a constraint, check the Strong\'s number/lemma, or widen --book.');
      }
      const byBook = db
        .prepare(`SELECT CAST(c.verse_start/1000000 AS INT) book_num, COUNT(*) n FROM syntax.clauses c WHERE ${where} GROUP BY 1 ORDER BY 1`)
        .all(...args) as Array<{ book_num: number; n: number }>;

      const rows = db
        .prepare(`SELECT c.clause_id, c.verse_start, c.verse_end, c.lang, c.kind, c.rule, c.negated FROM syntax.clauses c WHERE ${where} ORDER BY c.verse_start, c.clause_id LIMIT ?`)
        .all(...args, opts.limit + 1) as ClauseRow[];
      const truncated = rows.length > opts.limit;
      const shown = truncated ? rows.slice(0, opts.limit) : rows;

      const roleStmt = db.prepare(
        'SELECT clause_id, role, verse_id, word_pos, surface, lemma, strongs, negated FROM syntax.clause_roles WHERE clause_id = ? ORDER BY verse_id, word_pos, rowid',
      );
      const clauses = shown.map((c) => {
        const roleRows = roleStmt.all(c.clause_id) as RoleRow[];
        const byRole = new Map<string, RoleRow[]>();
        for (const r of roleRows) {
          if (!byRole.has(r.role)) byRole.set(r.role, []);
          byRole.get(r.role)!.push(r);
        }
        // Verse text: default translation, capped at the clause's first two verses.
        const textEnd = Math.min(c.verse_end, c.verse_start + 1);
        const text = versesFor(DEFAULT_TRANSLATION, c.verse_start, textEnd)
          .map((v) => v.text.trim())
          .join(' ');
        return {
          clause_id: c.clause_id,
          ref: refRange(c.verse_start, c.verse_end),
          verse_start: c.verse_start,
          verse_end: c.verse_end,
          lang: c.lang,
          rule: c.rule,
          negated: c.negated === 1,
          roles: Object.fromEntries(
            [...byRole.entries()].map(([role, rs]) => [
              role,
              rs.map((r) => ({ surface: r.surface, lemma: r.lemma, strongs: r.strongs })),
            ]),
          ),
          text: text || undefined,
        };
      });

      emit(
        opts,
        {
          total,
          truncated,
          hint: truncated ? 'More clauses exist; raise --limit or narrow with --book.' : undefined,
          by_book: byBook.map((b) => ({ book: byBookNum.get(b.book_num)?.name ?? String(b.book_num), n: b.n })),
          clauses,
        },
        () => {
          const dist = byBook.map((b) => `${byBookNum.get(b.book_num)?.name ?? b.book_num} ${b.n}`).join(', ');
          const lines: string[] = [`${total} clause${total === 1 ? '' : 's'}  (${dist})`, ''];
          for (const c of clauses) {
            const flags = [c.negated ? 'negated' : null, c.rule].filter(Boolean).join(', ');
            lines.push(`${c.ref}${flags ? `  [${flags}]` : ''}`);
            for (const role of ['s', 'v', 'vc', 'o', 'o2', 'io', 'p'] as const) {
              const rs = (c.roles as Record<string, Array<{ surface: string; lemma: string | null; strongs: string | null }>>)[role];
              if (!rs) continue;
              const label = { s: 'subject', v: 'verb', vc: 'copula', o: 'object', o2: 'object2', io: 'ind.obj', p: 'pred' }[role];
              const strongsList = [...new Set(rs.map((r) => r.strongs).filter(Boolean))].join(' ');
              lines.push(`  ${label!.padEnd(7)} ${rs.map((r) => r.surface).join(' ')}${strongsList ? `  (${strongsList})` : ''}`);
            }
            if (c.text) lines.push(`  ${c.text.length > 220 ? c.text.slice(0, 220) + '…' : c.text}`);
            lines.push('');
          }
          if (truncated) lines.push('… truncated (raise --limit or add --book)');
          return lines.join('\n');
        },
      );
    });
}
