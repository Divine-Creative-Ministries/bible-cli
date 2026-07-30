import type { Command } from 'commander';
import { byBookNum, formatVerseId } from '../canon.js';
import { openCore, openStudy } from '../db/index.js';
import { emit, fail } from '../output.js';
import { EDITION_BITS, guardRangeSize, reconstructVerseTexts } from './originals.js';
import { refOrFail } from './read.js';

/**
 * What this command reports and what it does NOT: the Greek editions here are
 * printed editions (NA/SBL/TR/Byz/WH/Tregelles/Tyndale House) and the Hebrew
 * K/Q data is the Masoretic reading tradition as digitized by STEPBible —
 * printed-edition-level evidence, not a manuscript apparatus.
 */
export const PROVENANCE = 'editions and Masoretic K/Q — printed-edition-level evidence, not a manuscript apparatus';

const FULL_MASK = Object.values(EDITION_BITS).reduce((a, b) => a | b, 0);

const editionNames = (mask: number): string[] =>
  Object.entries(EDITION_BITS).filter(([, b]) => mask & b).map(([n]) => n);

interface VRow {
  verse_id: number;
  word_num: number;
  part_num: number;
  lang: string;
  surface: string;
  translit: string | null;
  lemma: string | null;
  gloss: string | null;
  text_type: string | null;
  editions: number;
  is_default: number;
}

/**
 * A handful of default-stream rows carry a zero edition mask (source data
 * gap); treat those as shared by all editions rather than dropping the word
 * from every reconstructed text.
 */
const effectiveMask = (r: VRow): number => (r.editions === 0 && r.is_default === 1 ? FULL_MASK : r.editions);

const popcount = (n: number): number => {
  let c = 0;
  for (let x = n; x; x &= x - 1) c++;
  return c;
};

/** Per-edition running texts for one NT verse, grouped by identical text. */
function greekEditionTexts(rows: VRow[]): Array<{ editions: string[]; text: string }> {
  const groups = new Map<string, string[]>();
  for (const [name, bit] of Object.entries(EDITION_BITS)) {
    let stream = rows.filter((r) => (effectiveMask(r) & bit) !== 0);
    // Occasionally a base word AND a variant reading both claim the same
    // edition bit at one slot (overlapping masks in the source). Keep the
    // most specific attribution — the reading with the fewest editions —
    // instead of silently picking the lowest part_num.
    const byslot = new Map<number, VRow[]>();
    for (const r of stream) {
      if (!byslot.has(r.word_num)) byslot.set(r.word_num, []);
      byslot.get(r.word_num)!.push(r);
    }
    stream = [...byslot.values()].flatMap((slotRows) => {
      const surfaces = new Set(slotRows.map((r) => r.surface));
      if (surfaces.size <= 1) return slotRows;
      const minPop = Math.min(...slotRows.map((r) => popcount(effectiveMask(r))));
      return slotRows.filter((r) => popcount(effectiveMask(r)) === minPop);
    });
    const text = reconstructVerseTexts(stream)[0]?.text ?? '';
    if (!groups.has(text)) groups.set(text, []);
    groups.get(text)!.push(name);
  }
  return [...groups.entries()].map(([text, editions]) => ({ editions, text }));
}

export function registerVariantsCommand(program: Command): void {
  program
    .command('variants')
    .description(
      'Textual variants for a verse or short range, repackaged from the tagged data: per-edition Greek texts with edition-disputed words (NT), Masoretic Ketiv/Qere and LXX-stream readings (OT), and alternate Hebrew/Greek versification. Printed-edition-level evidence, not a manuscript apparatus.',
    )
    .argument('<ref>', 'reference (verse or short range, max 5 verses)')
    .option('--json', 'output JSON')
    .action((refArg: string, opts: { json?: boolean }) => {
      const ref = refOrFail(opts, refArg);
      const db = openStudy();
      guardRangeSize(opts, db, ref.start, ref.end, 5, 'variants');

      const rows = db
        .prepare(
          `SELECT verse_id, word_num, part_num, lang, surface, translit, lemma, gloss, text_type, editions, is_default
           FROM study.words w WHERE verse_id BETWEEN ? AND ? ORDER BY verse_id, word_num, part_num`,
        )
        .all(ref.start, ref.end) as VRow[];
      if (rows.length === 0) fail(opts, `No tagged original-language data for '${refArg}'.`);

      const vmap = openCore()
        .prepare('SELECT tradition, book_num, chapter, verse, spine_verse_id FROM versification_map WHERE spine_verse_id BETWEEN ? AND ? ORDER BY spine_verse_id, tradition')
        .all(ref.start, ref.end) as Array<{ tradition: string; book_num: number; chapter: number; verse: number; spine_verse_id: number }>;

      const verseIds = [...new Set(rows.map((r) => r.verse_id))];
      const verses = verseIds.map((vid) => {
        const vrows = rows.filter((r) => r.verse_id === vid);
        const testament = Math.floor(vid / 1_000_000) < 40 ? 'OT' : 'NT';
        const versification = vmap
          .filter((m) => m.spine_verse_id === vid)
          .map((m) => ({
            tradition: m.tradition,
            ref: `${byBookNum.get(m.book_num)?.name ?? m.book_num} ${m.chapter}:${m.verse}`,
          }));

        if (testament === 'NT') {
          const greek = vrows.filter((r) => r.lang === 'G');
          // Words not shared by all editions: any token whose edition mask
          // falls short of the full 8-edition set (includes marginal rows).
          const disputed = greek
            .filter((r) => (effectiveMask(r) & FULL_MASK) !== FULL_MASK)
            .map((r) => ({
              surface: r.surface,
              editions: editionNames(effectiveMask(r)),
              ...(r.gloss ? { gloss: r.gloss } : {}),
              in_default_stream: r.is_default === 1,
            }));
          return {
            ref: formatVerseId(vid),
            verse_id: vid,
            testament,
            edition_texts: greekEditionTexts(greek).map((g) => ({ editions: g.editions, text: g.text || null, omits_verse: g.text === '' })),
            disputed_words: disputed,
            versification,
          };
        }

        // OT: Ketiv/Qere slots. The dataset ships the Qere (read tradition) as
        // the default stream (text_type 'Q'); the Ketiv written form is not
        // preserved as separate rows in this data release.
        const slots = new Map<number, VRow[]>();
        for (const r of vrows.filter((x) => x.text_type === 'Q')) {
          if (!slots.has(r.word_num)) slots.set(r.word_num, []);
          slots.get(r.word_num)!.push(r);
        }
        const kq = [...slots.entries()]
          .sort((a, z) => a[0] - z[0])
          .map(([wordNum, parts]) => {
            const sorted = [...parts].sort((a, z) => a.part_num - z.part_num);
            return {
              word_num: wordNum,
              qere: {
                surface: sorted.map((p) => p.surface).join(''),
                translit: sorted.find((p) => p.translit)?.translit ?? null,
                gloss: sorted.map((p) => p.gloss).filter(Boolean).join(' ') || null,
              },
              ketiv: null,
              note: 'Qere (read tradition, default stream); the Ketiv written form is not preserved in this dataset',
            };
          });
        // Non-default OT rows: LXX-reconstructed additions (X) etc.
        const nonDefault = vrows
          .filter((r) => r.is_default === 0)
          .map((r) => ({
            surface: r.surface,
            ...(r.gloss ? { gloss: r.gloss } : {}),
            text_type: r.text_type,
            note: r.text_type?.startsWith('X') ? 'LXX-reconstructed addition, not in the Masoretic default stream' : 'variant stream',
          }));
        const restored = vrows.some((r) => r.text_type === 'R');
        return {
          ref: formatVerseId(vid),
          verse_id: vid,
          testament,
          ketiv_qere: kq,
          variant_stream_words: nonDefault,
          ...(restored ? { note: 'verse carries text_type R: restored — absent from the Leningrad Codex main text, supplied from other Masoretic witnesses' } : {}),
          versification,
        };
      });

      emit(opts, { ref: refArg, provenance: PROVENANCE, verses }, () => {
        const lines: string[] = [`provenance: ${PROVENANCE}`, ''];
        for (const v of verses) {
          lines.push(`${v.ref} (${v.testament})`);
          if (v.testament === 'NT') {
            const nt = v as Extract<typeof v, { edition_texts: unknown[] }>;
            for (const g of nt.edition_texts) {
              lines.push(`  [${g.editions.join(' ')}]`);
              lines.push(`    ${g.omits_verse ? '(omits this verse)' : g.text}`);
            }
            if (nt.disputed_words.length > 0) {
              lines.push('  words not shared by all editions:');
              for (const d of nt.disputed_words) {
                lines.push(`    ${d.surface}  [${d.editions.join(' ') || 'margin only'}]${d.gloss ? `  — ${d.gloss}` : ''}${d.in_default_stream ? '' : '  (variant stream)'}`);
              }
            } else {
              lines.push('  all words shared by all eight editions.');
            }
          } else {
            const ot = v as Extract<typeof v, { ketiv_qere: unknown[] }>;
            if (ot.ketiv_qere.length > 0) {
              lines.push('  Ketiv/Qere:');
              for (const k of ot.ketiv_qere) {
                lines.push(`    word ${k.word_num}: Qere ${k.qere.surface}${k.qere.translit ? ` (${k.qere.translit})` : ''}${k.qere.gloss ? ` — ${k.qere.gloss}` : ''}`);
                lines.push('      (Ketiv written form not preserved in this dataset)');
              }
            }
            if (ot.variant_stream_words.length > 0) {
              lines.push('  variant-stream words (not in the default Masoretic stream):');
              for (const w of ot.variant_stream_words) {
                lines.push(`    ${w.surface}${w.gloss ? ` — ${w.gloss}` : ''}  [${w.text_type}] ${w.note}`);
              }
            }
            if ('note' in ot && ot.note) lines.push(`  note: ${ot.note}`);
            if (ot.ketiv_qere.length === 0 && ot.variant_stream_words.length === 0 && !('note' in ot && ot.note)) {
              lines.push('  no Ketiv/Qere or variant-stream readings recorded.');
            }
          }
          if (v.versification.length > 0) {
            lines.push('  alternate versification: ' + v.versification.map((m) => `${m.tradition} ${m.ref}`).join('; '));
          }
          lines.push('');
        }
        return lines.join('\n').trimEnd();
      });
    });
}
