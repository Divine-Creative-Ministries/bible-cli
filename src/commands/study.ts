import type { Command } from 'commander';
import * as fs from 'node:fs';
import { byBookNum, formatVerseId } from '../canon.js';
import { openCore, openStudy } from '../db/index.js';
import { emit, fail, table } from '../output.js';
import { RefError } from '../refparse/index.js';
import {
  addNote,
  advanceCursor,
  chapterUnits,
  chunkUnits,
  coverage,
  createSession,
  defaultSession,
  deleteSession,
  findRecurrences,
  gotoUnit,
  listSessions,
  loadSession,
  logRead,
  NOTE_STATUSES,
  NOTE_TYPES,
  notesThrough,
  resolveNote,
  resolveScope,
  saveSession,
  sessionExists,
  sessionPath,
  slugify,
  StudyError,
  studiesDir,
  type LemmaSource,
  type NoteStatus,
  type NoteType,
  type StudyNote,
  type StudySession,
} from '../study/session.js';
import { loadChapters } from './reading.js';
import { DEFAULT_TRANSLATION, intOpt, refOrFail, resolveTranslations } from './read.js';

/**
 * Inductive reading sessions (`bible study`): the read-first workflow made
 * durable. A cursor pages through a scope unit by unit; a typed notebook
 * records observations/questions/patterns — every note anchored to exact
 * verse ids; recurrence surfacing connects open patterns and questions to the
 * unit being read via shared distinctive vocabulary. Search follows
 * observation: the notebook is evidence the agent gathered by reading, never
 * free-floating summary.
 */

const DISTINCTIVE_MAX_FREQ = 300; // corpus occurrences for a lemma to count as distinctive
const MIN_SHARED_LEMMAS = 2; // recurrence threshold
const TAIL_CHARS = 200;

interface NameOpt {
  name?: string;
  json?: boolean;
}

function orFail<T>(opts: { json?: boolean }, fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof StudyError || e instanceof RefError) fail(opts, e.message);
    throw e;
  }
}

function getSession(opts: NameOpt): StudySession {
  return opts.name ? loadSession(opts.name) : defaultSession();
}

/** Exact verse ids present on the spine within [start, end]. */
function verseIdsBetween(start: number, end: number): number[] {
  return (openCore().prepare('SELECT verse_id FROM verses WHERE verse_id BETWEEN ? AND ? ORDER BY verse_id').all(start, end) as Array<{ verse_id: number }>).map(
    (r) => r.verse_id,
  );
}

/** Parse a --refs list ("Gen 22:11, Gen 46:2") into exact verse-id anchors. */
function expandRefs(opts: { json?: boolean }, refsArg: string): number[] {
  const ids: number[] = [];
  for (const part of refsArg.split(',').map((p) => p.trim()).filter(Boolean)) {
    const ref = refOrFail(opts, part);
    if (ref.kind === 'book' || ref.kind === 'chapter') {
      fail(opts, `--refs must be single verses or short ranges ('Gen 22:11' or 'Gen 22:11-14'), not a whole ${ref.kind} ('${part}').`);
    }
    const rows = verseIdsBetween(ref.start, ref.end);
    if (rows.length === 0) fail(opts, `No verses found for '${part}'.`);
    if (rows.length > 10) fail(opts, `--refs ranges must be short (max 10 verses); '${part}' spans ${rows.length}.`);
    ids.push(...rows);
  }
  if (ids.length === 0) fail(opts, '--refs contained no references.');
  return ids;
}

/** Study-db-backed lemma lookups for recurrence surfacing; null if the db is absent. */
function lemmaSource(): LemmaSource | null {
  let db: ReturnType<typeof openStudy>;
  try {
    db = openStudy();
  } catch {
    return null; // recurrence surfacing degrades silently without the study db
  }
  return {
    distinctiveLemmas(refs) {
      const ph = refs.map(() => '?').join(',');
      return (
        db
          .prepare(
            `WITH ev AS (
               SELECT DISTINCT lemma FROM study.words
               WHERE verse_id IN (${ph}) AND is_default = 1 AND lemma IS NOT NULL
                 AND strongs IS NOT NULL AND strongs_num < 9000)
             SELECT lemma FROM ev
             WHERE (SELECT COUNT(*) FROM study.words w WHERE w.lemma = ev.lemma AND w.is_default = 1) <= ${DISTINCTIVE_MAX_FREQ}
             LIMIT 64`,
          )
          .all(...refs) as Array<{ lemma: string }>
      ).map((r) => r.lemma);
    },
    unitLemmas(start, end) {
      return new Set(
        (
          db
            .prepare('SELECT DISTINCT lemma FROM study.words WHERE verse_id BETWEEN ? AND ? AND is_default = 1 AND lemma IS NOT NULL')
            .all(start, end) as Array<{ lemma: string }>
        ).map((r) => r.lemma),
      );
    },
    locations(start, end, lemmas) {
      const ph = lemmas.map(() => '?').join(',');
      return (
        db
          .prepare(`SELECT DISTINCT verse_id FROM study.words WHERE verse_id BETWEEN ? AND ? AND is_default = 1 AND lemma IN (${ph}) ORDER BY verse_id`)
          .all(start, end, ...lemmas) as Array<{ verse_id: number }>
      ).map((r) => r.verse_id);
    },
  };
}

const refList = (ids: number[], max = 6): string =>
  ids.slice(0, max).map(formatVerseId).join(', ') + (ids.length > max ? ` +${ids.length - max} more` : '');

const truncate = (s: string, n: number): string => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/** Shared body of `study next` / `study prev`. */
function showUnit(opts: NameOpt, direction: 1 | -1): void {
  orFail(opts, () => {
    const s = getSession(opts);
    const idx = advanceCursor(s, direction);
    const unit = s.units[idx]!;
    const bare = s.options.bare;
    const chapters = loadChapters(s.translation, unit.start, unit.end, { bare });
    if (chapters.length === 0) fail(opts, `No text found for ${unit.label} in ${s.translation}.`);

    let tail: string | undefined;
    if (idx > 0) {
      const prev = s.units[idx - 1]!;
      const flat = loadChapters(s.translation, prev.start, prev.end, { bare })
        .map((c) => c.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      tail = `…${flat.slice(-TAIL_CHARS)}`;
    }

    const src = lemmaSource();
    const recurrences = src ? findRecurrences(s, idx, src) : [];

    logRead(s, idx);
    saveSession(s);

    const percent = Math.round((100 * (idx + 1)) / s.units.length);
    emit(
      opts,
      {
        session: s.name,
        unit: { index: idx + 1, of: s.units.length, ref: unit.label, percent },
        ...(tail ? { previous_tail: tail } : {}),
        chapters: chapters.map((c) => ({ ref: `${byBookNum.get(c.bookNum)!.name} ${c.chapter}`, text: c.text })),
        recurrences: recurrences.map((r) => ({
          note: r.note_id,
          type: r.note_type,
          text: r.note_text,
          shared_distinctive_lemmas: r.lemmas,
          at: r.at.map((id) => ({ ref: formatVerseId(id), verse_id: id })),
        })),
        ...(s.cursor < s.units.length ? { next: 'bible study next' } : { end_of_scope: true }),
      },
      () => {
        const lines = [
          `── ${unit.label} [${s.translation}] · unit ${idx + 1}/${s.units.length} (${percent}%) · session '${s.name}' ──`,
        ];
        if (tail) lines.push('', `(previously) ${tail}`);
        lines.push('', ...chapters.map((c) => c.text).join('\n\n').split('\n'));
        if (recurrences.length > 0) {
          lines.push('', 'RECURRENCES:');
          for (const r of recurrences) {
            lines.push(
              `  note #${r.note_id} (${r.note_type}: '${truncate(r.note_text, 60)}') — shared distinctive lemmas: ${r.lemmas.join(', ')} at ${refList(r.at)}`,
            );
          }
        }
        lines.push(
          '',
          s.cursor < s.units.length
            ? `→ continue: bible study next · note what you see: bible study note "<text>" --type observation`
            : `✓ end of scope — synthesize: bible study review`,
        );
        return lines.join('\n');
      },
    );
  });
}

export function registerStudyCommands(program: Command): void {
  const study = program
    .command('study')
    .description(
      'Inductive reading sessions: a durable cursor over a scope plus a verse-anchored notebook — read, observe, record; search follows observation. Start with: bible study start Genesis',
    );

  const nameOpt = (c: Command): Command => c.option('--name <session>', 'session to use (default: most recently updated)');

  study
    .command('start')
    .description("Begin a reading session over a scope: a book, range ('Gen-Deu'), 'ot', 'nt', or 'bible'.")
    .argument('<scope>', "what to read: 'Genesis', 'Gen-Deu', 'Isaiah 40-55', 'ot', 'nt', 'bible'")
    .option('--name <session>', 'session name (default: derived from the scope)')
    .option('-t, --translation <id>', `translation (default ${DEFAULT_TRANSLATION})`)
    .option('--unit <kind>', "reading unit: 'chapter' or 'chunk' (default chapter)", 'chapter')
    .option('--chunk-size <chars>', 'target characters per unit for --unit chunk (default 12000)', intOpt, 12000)
    .option('--bare', 'blind reading: no verse numbers or superscription brackets — flowing text only')
    .option('--json', 'output JSON')
    .action((scope: string, opts: { name?: string; translation?: string; unit: string; chunkSize: number; bare?: boolean; json?: boolean }) => {
      orFail(opts, () => {
        if (opts.unit !== 'chapter' && opts.unit !== 'chunk') fail(opts, `--unit must be 'chapter' or 'chunk'.`);
        const tr = resolveTranslations(opts, opts.translation)[0]!;
        const ranges = resolveScope(scope);
        const name = slugify(opts.name ?? scope);
        if (sessionExists(name)) {
          fail(opts, `Study session '${name}' already exists. Pick another with --name, or resume it: bible study next --name ${name}`);
        }
        const bare = Boolean(opts.bare);
        const units =
          opts.unit === 'chapter'
            ? chapterUnits(ranges)
            : chunkUnits(ranges, (a, b) => loadChapters(tr, a, b, { bare }), opts.chunkSize);
        const s = createSession({
          name,
          scopeInput: scope,
          ranges,
          translation: tr,
          unit: opts.unit,
          chunkSize: opts.unit === 'chunk' ? opts.chunkSize : undefined,
          bare,
          units,
        });
        saveSession(s);
        emit(
          opts,
          {
            session: s.name,
            scope: { input: scope, ranges: ranges.map((r) => r.label) },
            translation: tr,
            unit: s.unit,
            ...(s.chunkSize ? { chunk_size: s.chunkSize } : {}),
            bare,
            units_total: units.length,
            first_unit: units[0]!.label,
            path: sessionPath(name),
            next: `bible study next${opts.name ? ` --name ${name}` : ''}`,
          },
          () =>
            [
              `Started study session '${s.name}': ${scope} [${tr}] · ${units.length} ${s.unit} units, beginning at ${units[0]!.label}${bare ? ' · bare (blind reading)' : ''}`,
              `State persists in ${sessionPath(name)}`,
              `→ read the first unit: bible study next`,
            ].join('\n'),
        );
      });
    });

  nameOpt(study.command('next'))
    .description('Read the next unit: text, continuity tail, progress, and recurrences of open patterns/questions.')
    .option('--json', 'output JSON')
    .action((opts: NameOpt) => showUnit(opts, 1));

  nameOpt(study.command('prev'))
    .description('Step back and re-read the previous unit.')
    .option('--json', 'output JSON')
    .action((opts: NameOpt) => showUnit(opts, -1));

  nameOpt(study.command('goto'))
    .description("Move the cursor so the next read is the unit containing a reference. Example: bible study goto 'Exodus 3'")
    .argument('<ref>', 'reference within the session scope')
    .option('--json', 'output JSON')
    .action((refArg: string, opts: NameOpt) => {
      orFail(opts, () => {
        const s = getSession(opts);
        const ref = refOrFail(opts, refArg);
        const idx = gotoUnit(s, ref.start);
        saveSession(s);
        emit(
          opts,
          { session: s.name, cursor: idx, unit: { index: idx + 1, of: s.units.length, ref: s.units[idx]!.label }, next: 'bible study next' },
          () => `Cursor at ${s.units[idx]!.label} (unit ${idx + 1}/${s.units.length}).\n→ read it: bible study next`,
        );
      });
    });

  nameOpt(study.command('note'))
    .description('Record a notebook entry anchored to exact verses. Anchors default to the unit just read; notes without anchors are rejected.')
    .argument('<text>', 'the observation in your own words')
    .requiredOption('--type <type>', `one of: ${NOTE_TYPES.join(', ')}`)
    .option('--refs <refs>', 'comma-separated verse anchors: "Gen 22:11, Gen 46:2" (single verses or short ranges)')
    .option('--against <noteId>', 'for --type counterexample: the pattern note this evidence tests', intOpt)
    .option('--json', 'output JSON')
    .action((text: string, opts: NameOpt & { type: string; refs?: string; against?: number }) => {
      orFail(opts, () => {
        const s = getSession(opts);
        let refs: number[];
        let unitRef: string | undefined;
        if (opts.refs) {
          refs = expandRefs(opts, opts.refs);
        } else {
          if (s.cursor === 0 || s.read_log.length === 0) {
            fail(opts, 'Nothing read yet in this session — pass --refs, or read a unit first (bible study next) so the note can anchor to it.');
          }
          const unit = s.units[s.cursor - 1]!;
          refs = verseIdsBetween(unit.start, unit.end);
          unitRef = unit.label;
        }
        const note = addNote(s, { type: opts.type as NoteType, text, refs, against: opts.against, unitRef });
        saveSession(s);
        emit(
          opts,
          { session: s.name, note: { id: note.id, type: note.type, status: note.status, refs: note.refs.map(formatVerseId), unit: note.unit_ref, links: note.links } },
          () =>
            `Note #${note.id} (${note.type}${note.status ? `, ${note.status}` : ''}) anchored to ${refList(note.refs)}${note.links ? ` · against #${note.links[0]}` : ''}`,
        );
      });
    });

  nameOpt(study.command('resolve'))
    .description("Settle a pattern after testing it: --status supported | refuted (or open to reopen). Counterexamples never flip a pattern implicitly.")
    .argument('<id>', 'pattern note id', intOpt)
    .requiredOption('--status <status>', NOTE_STATUSES.join(' | '))
    .option('--json', 'output JSON')
    .action((id: number, opts: NameOpt & { status: string }) => {
      orFail(opts, () => {
        const s = getSession(opts);
        const note = resolveNote(s, id, opts.status as NoteStatus);
        saveSession(s);
        emit(opts, { session: s.name, note: { id: note.id, type: note.type, status: note.status, text: note.text } }, () => `Note #${note.id} (pattern) → ${note.status}.`);
      });
    });

  nameOpt(study.command('notes'))
    .description('List the notebook, compact.')
    .option('--type <type>', `filter: ${NOTE_TYPES.join(', ')}`)
    .option('--open', 'only open patterns')
    .option('--json', 'output JSON')
    .action((opts: NameOpt & { type?: string; open?: boolean }) => {
      orFail(opts, () => {
        const s = getSession(opts);
        let notes = s.notes;
        if (opts.type) notes = notes.filter((n) => n.type === opts.type);
        if (opts.open) notes = notes.filter((n) => n.status === 'open');
        emit(
          opts,
          {
            session: s.name,
            count: notes.length,
            notes: notes.map((n) => ({
              id: n.id,
              type: n.type,
              ...(n.status ? { status: n.status } : {}),
              text: n.text,
              refs: n.refs.map(formatVerseId),
              unit: n.unit_ref,
              ...(n.links ? { links: n.links } : {}),
              created: n.created,
            })),
          },
          () =>
            notes.length === 0
              ? opts.type || opts.open
                ? 'No matching notes.'
                : 'No notes yet.'
              : table(
                  notes.map((n) => [
                    `#${n.id}`,
                    n.type + (n.status ? `(${n.status})` : ''),
                    refList(n.refs, 3),
                    truncate(n.text, 72) + (n.links ? ` [against #${n.links.join(',#')}]` : ''),
                  ]),
                ),
        );
      });
    });

  nameOpt(study.command('coverage'))
    .description('Read/unread units per book, unread gaps, and notebook stats.')
    .option('--json', 'output JSON')
    .action((opts: NameOpt) => {
      orFail(opts, () => {
        const s = getSession(opts);
        const c = coverage(s);
        emit(opts, { session: s.name, scope: s.scope.input, ...c }, () => {
          const lines = [
            `Session '${s.name}' (${s.scope.input}): ${c.units_read}/${c.units_total} units read (${c.percent}%)`,
            '',
            table(c.books.map((b) => [b.book, `${b.read}/${b.units}`, b.units > 0 ? `${Math.round((100 * b.read) / b.units)}%` : '—'])),
          ];
          if (c.gaps.length > 0) {
            const shown = c.gaps.slice(0, 12);
            lines.push(
              '',
              `Unread gaps: ${shown.map((g) => (g.units === 1 ? g.from : `${g.from} – ${g.to} (${g.units})`)).join(' · ')}${c.gaps.length > 12 ? ` · +${c.gaps.length - 12} more` : ''}`,
            );
          }
          const byType = Object.entries(c.notes.by_type);
          const status = Object.entries(c.notes.patterns_by_status);
          lines.push(
            '',
            `Notes: ${byType.length === 0 ? 'none' : byType.map(([t, n]) => `${t} ${n}`).join(' · ')}${status.length > 0 ? ` (patterns: ${status.map(([st, n]) => `${st} ${n}`).join(', ')})` : ''}`,
          );
          return lines.join('\n');
        });
      });
    });

  nameOpt(study.command('review'))
    .description('The synthesis input: all notes anchored up to the cursor (or --through <ref>), grouped by type.')
    .option('--through <ref>', 'include notes anchored at or before this reference')
    .option('--json', 'output JSON')
    .action((opts: NameOpt & { through?: string }) => {
      orFail(opts, () => {
        const s = getSession(opts);
        const endId = opts.through ? refOrFail(opts, opts.through).end : s.cursor > 0 ? s.units[s.cursor - 1]!.end : 0;
        const throughLabel = opts.through ?? (s.cursor > 0 ? s.units[s.cursor - 1]!.label : null);
        const grouped = notesThrough(s, endId);
        const noteJson = (n: StudyNote): Record<string, unknown> => ({
          id: n.id,
          text: n.text,
          refs: n.refs.map(formatVerseId),
          ...(n.status ? { status: n.status } : {}),
          ...(n.links ? { links: n.links } : {}),
        });
        emit(
          opts,
          {
            session: s.name,
            through: throughLabel,
            through_verse_id: endId,
            groups: Object.fromEntries([...grouped.entries()].map(([t, ns]) => [t, ns.map(noteJson)])),
          },
          () => {
            const lines = [`── review · session '${s.name}' · notes through ${throughLabel ?? '(nothing read yet)'} ──`];
            let any = false;
            for (const [t, ns] of grouped) {
              if (ns.length === 0) continue;
              any = true;
              lines.push('', `${t.toUpperCase()}S`);
              for (const n of ns) {
                lines.push(`  #${n.id}${n.status ? ` (${n.status})` : ''} ${n.text}`, `      — ${refList(n.refs)}`);
              }
            }
            if (!any) lines.push('', 'No notes in range yet. Read, observe, and record: bible study note "<text>" --type observation');
            return lines.join('\n');
          },
        );
      });
    });

  nameOpt(study.command('export'))
    .description('Dump the full session JSON (cursor, notebook, read log) to stdout or a file.')
    .option('--out <file>', 'write to a file instead of stdout')
    .option('--json', 'output JSON (default for this command)')
    .action((opts: NameOpt & { out?: string }) => {
      orFail(opts, () => {
        const s = getSession(opts);
        const body = JSON.stringify(s, null, 2) + '\n';
        if (opts.out) {
          fs.writeFileSync(opts.out, body);
          emit(opts, { session: s.name, written: opts.out }, () => `Wrote ${opts.out}`);
        } else {
          process.stdout.write(body);
        }
      });
    });

  study
    .command('list')
    .description('List study sessions, most recently updated first.')
    .option('--json', 'output JSON')
    .action((opts: { json?: boolean }) => {
      orFail(opts, () => {
        const sessions = listSessions();
        emit(
          opts,
          {
            dir: studiesDir(),
            sessions: sessions.map((s) => ({
              name: s.name,
              scope: s.scope.input,
              translation: s.translation,
              unit: s.unit,
              progress: `${new Set(s.read_log.map((r) => r.unit)).size}/${s.units.length}`,
              notes: s.notes.length,
              updated: s.updated,
            })),
          },
          () =>
            sessions.length === 0
              ? "No study sessions. Start one: bible study start <scope>"
              : table(
                  sessions.map((s) => [
                    s.name,
                    s.scope.input,
                    `[${s.translation}]`,
                    `${new Set(s.read_log.map((r) => r.unit)).size}/${s.units.length} read`,
                    `${s.notes.length} notes`,
                    s.updated.slice(0, 10),
                  ]),
                ),
        );
      });
    });

  study
    .command('delete')
    .description('Delete a session permanently. The session name must be typed out.')
    .argument('<name>', 'exact session name to delete')
    .option('--json', 'output JSON')
    .action((name: string, opts: { json?: boolean }) => {
      orFail(opts, () => {
        deleteSession(name);
        emit(opts, { deleted: slugify(name) }, () => `Deleted study session '${slugify(name)}'.`);
      });
    });
}
