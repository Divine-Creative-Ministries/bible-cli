import type { Database } from 'better-sqlite3';
import * as path from 'node:path';
import { RAW, log, normalizeGreek, normalizeHebrew, parseStepRef, splitStrongs, stepRows } from '../lib.js';
import { MorphParts, emptyParts, parseOshmMorpheme } from '../morph/oshm.js';
import { parseRobinson } from '../morph/robinson.js';

const EDITION_BITS: Record<string, number> = {
  NA27: 1, NA28: 2, SBL: 4, TR: 8, Byz: 16, WH: 32, Treg: 64, Tyn: 128,
};
export const EDITION_NAMES = Object.keys(EDITION_BITS);

interface InsertCtx {
  ins: ReturnType<Database['prepare']>;
  insVmap: ReturnType<Database['prepare']>;
  ensureVerse: (verseId: number) => void;
  wordId: { n: number };
  errors: Map<string, number>;
}

function makeCtx(db: Database, core: Database): InsertCtx {
  const insVerse = core.prepare('INSERT OR IGNORE INTO verses (verse_id, book_num, chapter, verse) VALUES (?,?,?,?)');
  return {
    ins: db.prepare(
      `INSERT INTO words (word_id, verse_id, word_num, part_num, lang, surface, surface_norm, translit,
        lemma, lemma_norm, strongs, strongs_num, strongs_suffix, gloss, morph_raw, morph_scheme,
        pos, person, gender, number_, gcase, tense, voice, mood, stem, state, degree,
        text_type, editions, is_default)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ),
    insVmap: core.prepare(
      'INSERT OR IGNORE INTO versification_map (tradition, book_num, chapter, verse, spine_verse_id) VALUES (?,?,?,?,?)',
    ),
    ensureVerse: (verseId: number) => {
      insVerse.run(verseId, Math.floor(verseId / 1_000_000), Math.floor((verseId % 1_000_000) / 1_000), verseId % 1_000);
    },
    wordId: { n: 1 },
    errors: new Map(),
  };
}

function noteError(ctx: InsertCtx, key: string): void {
  ctx.errors.set(key, (ctx.errors.get(key) ?? 0) + 1);
}

/** Strip punctuation tags (after backslash) from a TAHOT compound cell. */
const stripPunct = (s: string): string => s.split('\\')[0]!;

export function stageHebrewWords(study: Database, core: Database): void {
  const ctx = makeCtx(study, core);
  const files = ['TAHOT-1.txt', 'TAHOT-2.txt', 'TAHOT-3.txt', 'TAHOT-4.txt'];
  let rows = 0;

  study.transaction(() => {
    for (const file of files) {
      for (const cells of stepRows(path.join(RAW, 'stepbible', file), /^[1-9A-Za-z]+\.\d+\.\d+/)) {
        const ref = parseStepRef(cells[0]!);
        if (!ref) {
          noteError(ctx, `badref:${cells[0]!.slice(0, 30)}`);
          continue;
        }
        const hebrew = cells[1] ?? '';
        const translit = cells[2] ?? '';
        const gloss = cells[3] ?? '';
        const dstrongs = cells[4] ?? '';
        const morph = cells[5] ?? '';

        // language prefix on the whole morph string
        const langChar = morph[0] === 'A' ? 'A' : 'H';
        const morphParts = morph.slice(1).split('/');
        const surfaceParts = hebrew.split('/').map(stripPunct);
        const strongParts = stripPunct(dstrongs).split('/');
        const glossParts = gloss.split('/');
        // lemma per morpheme from the expanded column [11]: code=lemma=gloss segments
        const expanded = stripPunct(cells[11] ?? '').split('/');

        const textType = ref.meta.replace(/\(.*\)/, '').trim() || 'L';

        // X rows are LXX-reconstructed additions in their own numbering stream
        // (4-digit word numbers). Our English base texts follow the MT, so X
        // stays out of the default stream; the -500 offset sorts additions
        // before the verse's Leningrad words, where they belong.
        const isX = textType.startsWith('X');
        const wordNum = isX ? ref.wordNum - 500 : ref.wordNum;
        const isDefault = isX ? 0 : 1;

        ctx.ensureVerse(ref.verseId);
        if (ref.native) {
          ctx.insVmap.run('Hebrew', ref.native.bookNum, ref.native.chapter, ref.native.verse, ref.verseId);
        }

        const n = Math.max(surfaceParts.length, strongParts.length, morphParts.length);
        for (let i = 0; i < n; i++) {
          const surface = (surfaceParts[i] ?? surfaceParts[surfaceParts.length - 1] ?? '').trim();
          const strongsRaw = (strongParts[i] ?? '').replace(/[{}+]/g, '').trim();
          const morphRaw = (morphParts[i] ?? '').trim();
          const glossPart = (glossParts[i] ?? (i === 0 ? gloss : '')).trim();
          // Qere/Ketiv alignment placeholders produce fully empty components.
          if (!surface && !strongsRaw && !morphRaw) continue;

          let parts: MorphParts = emptyParts();
          if (morphRaw) {
            try {
              // TAHOT uses lowercase 'c' for waw-consecutive conjunction etc.
              const code = /^[a-z]/.test(morphRaw) && morphRaw.length === 1 ? morphRaw.toUpperCase() : morphRaw;
              parts = parseOshmMorpheme(code, langChar);
            } catch (e) {
              noteError(ctx, `morph:${morphRaw}`);
            }
          }

          const st = strongsRaw ? splitStrongs(strongsRaw) : undefined;
          let lemma: string | null = null;
          const exp = expanded[i];
          if (exp) {
            const seg = exp.replace(/[{}]/g, '').split('=');
            if (seg.length >= 2) lemma = seg[1]!.trim() || null;
          }

          ctx.ins.run(
            ctx.wordId.n++,
            ref.verseId,
            wordNum,
            i + 1,
            langChar,
            surface,
            normalizeHebrew(surface),
            i === 0 ? translit : null,
            lemma,
            lemma ? normalizeHebrew(lemma) : null,
            st?.strongs ?? null,
            st?.num ?? null,
            st?.suffix ?? null,
            glossPart || null,
            morphRaw || null,
            'oshm',
            parts.pos, parts.person, parts.gender, parts.number, parts.gcase,
            parts.tense, parts.voice, parts.mood, parts.stem, parts.state, parts.degree,
            textType,
            0,
            isDefault,
          );
          rows++;
        }
      }
      log(`${file} ingested`);
    }
  })();

  reportErrors(ctx, 'TAHOT');
  log(`Hebrew morpheme rows: ${rows}`);
}

export function stageGreekWords(study: Database, core: Database): void {
  const ctx = makeCtx(study, core);
  ctx.wordId.n = 1_000_000_0; // Greek rows start above Hebrew id space
  const files = ['TAGNT-1.txt', 'TAGNT-2.txt'];
  let rows = 0;
  const spineHas = core.prepare('SELECT 1 FROM verses WHERE verse_id = ?');

  const seenDefault = new Set<string>();
  let demoted = 0;

  study.transaction(() => {
    for (const file of files) {
      for (const cells of stepRows(path.join(RAW, 'stepbible', file), /^[1-9A-Za-z]+\.\d+\.\d+/)) {
        const ref = parseStepRef(cells[0]!);
        if (!ref) {
          noteError(ctx, `badref:${cells[0]!.slice(0, 40)}`);
          continue;
        }
        const greekCell = cells[1] ?? '';
        const glossEn = (cells[2] ?? '').trim();
        const dstrongMorph = cells[3] ?? '';
        const lemmaGloss = cells[4] ?? '';
        const editionsCell = (cells[5] ?? '').trim();

        // Crasis/compound words carry multiple tags: 'G2532=CONJ + G1563=ADV'
        const components: Array<{ strongs: string; morph: string }> = [];
        for (const comp of dstrongMorph.split(/\s\+\s/)) {
          const gm = comp.trim().match(/^(G\d+[A-Za-z]?)=(.+)$/);
          if (gm) components.push({ strongs: gm[1]!, morph: gm[2]!.trim() });
        }
        if (components.length === 0) {
          noteError(ctx, `dstrong:${dstrongMorph.slice(0, 20)}`);
          continue;
        }
        const sm = greekCell.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
        const surface = (sm ? sm[1]! : greekCell).trim();
        const translit = sm ? sm[2]!.trim() : null;
        const lemma = (lemmaGloss.split('=')[0] ?? '').trim() || null;

        let editions = 0;
        for (const e of editionsCell.split('+')) {
          const bit = EDITION_BITS[e.trim()];
          if (bit) editions |= bit;
        }
        // Word-type letters: N/n = in the NA (modern critical) stream.
        let isDefault = /n/i.test(ref.meta.replace(/\(.*?\)/g, '')) ? 1 : 0;

        // Spine key: main (NRSV-style) ref if present, else the KJV bracket ref.
        let verseId = ref.verseId;
        let wordNum = ref.wordNum;
        if (!spineHas.get(verseId) && ref.native) {
          verseId = ref.native.bookNum * 1_000_000 + ref.native.chapter * 1_000 + ref.native.verse;
          // Keep canonical order: text remapped from an earlier Greek verse
          // (Rev 12:18 -> spine 13:1) sorts before the target verse's own
          // words; text from a later one (3Jn 1:15 -> spine 1:14) sorts after.
          wordNum = ref.verseId < verseId ? ref.wordNum - 500 : ref.wordNum + 200 + (ref.verseId % 1000);
        }
        ctx.ensureVerse(verseId);
        if (verseId !== ref.verseId) {
          // Record where the Greek-tradition numbering lives on the spine.
          const g = { book: Math.floor(ref.verseId / 1_000_000), ch: Math.floor((ref.verseId % 1_000_000) / 1_000), v: ref.verseId % 1_000 };
          ctx.insVmap.run('Greek', g.book, g.ch, g.v, verseId);
        }

        // TAGNT lists edition-order 'moved' words once per position; keep the
        // first occurrence in the default stream.
        if (isDefault) {
          const key = `${verseId}:${wordNum}`;
          if (seenDefault.has(key)) {
            isDefault = 0;
            demoted++;
          } else {
            seenDefault.add(key);
          }
        }

        for (let ci = 0; ci < components.length; ci++) {
          const comp = components[ci]!;
          const st = splitStrongs(comp.strongs);
          let parts: MorphParts = emptyParts();
          try {
            parts = parseRobinson(comp.morph);
          } catch {
            noteError(ctx, `morph:${comp.morph}`);
          }
          // Crasis components get their own lemma resolved from the lexicon in
          // a post-pass; the source's combined lemma belongs to no component.
          const compLemma = components.length === 1 ? lemma : null;
          ctx.ins.run(
            ctx.wordId.n++,
            verseId,
            wordNum,
            ci + 1,
            'G',
            surface,
            normalizeGreek(surface),
            translit,
            compLemma,
            compLemma ? normalizeGreek(compLemma) : null,
            st?.strongs ?? null,
            st?.num ?? null,
            st?.suffix ?? null,
            glossEn || null,
            comp.morph,
            'robinson',
            parts.pos, parts.person, parts.gender, parts.number, parts.gcase,
            parts.tense, parts.voice, parts.mood, parts.stem, parts.state, parts.degree,
            ref.meta,
            editions,
            isDefault,
          );
          rows++;
        }

        // Apparatus substitutions live in the meaning-variant column, e.g.
        // 'υἱός (T=huios) son - G5207=N-NSM in: Tyn+TR+Byz'. Ingest each as a
        // non-default row carrying the editions that actually read it, so
        // --edition renders real edition wording.
        const variantCell = (cells[6] ?? '').trim();
        if (variantCell) {
          let vi = 0;
          for (const seg of variantCell.split(/;(?![^(]*\))/)) {
            const vm = seg.trim().match(/^(.+?)\s*\(([^)]*)\)\s*(.*?)\s*-\s*(G\d+[A-Za-z]?)=(\S+)\s+in:\s*(\S+)/);
            if (!vm) continue;
            vi++;
            const vSurface = vm[1]!.trim();
            const vGloss = vm[3]!.trim();
            const vSt = splitStrongs(vm[4]!);
            const vMorph = vm[5]!.trim();
            let vEditions = 0;
            for (const e of vm[6]!.split('+')) {
              const bit = EDITION_BITS[e.trim()];
              if (bit) vEditions |= bit;
            }
            if (!vSurface || vEditions === 0) continue;
            let vParts: MorphParts = emptyParts();
            try {
              vParts = parseRobinson(vMorph);
            } catch {
              noteError(ctx, `morph:${vMorph}`);
            }
            ctx.ins.run(
              ctx.wordId.n++,
              verseId,
              wordNum,
              components.length + vi,
              'G',
              vSurface,
              normalizeGreek(vSurface),
              vm[2]!.replace(/^[A-Za-z]+=/, '').trim() || null,
              null,
              null,
              vSt?.strongs ?? null,
              vSt?.num ?? null,
              vSt?.suffix ?? null,
              vGloss || null,
              vMorph,
              'robinson',
              vParts.pos, vParts.person, vParts.gender, vParts.number, vParts.gcase,
              vParts.tense, vParts.voice, vParts.mood, vParts.stem, vParts.state, vParts.degree,
              'variant',
              vEditions,
              0,
            );
            rows++;
          }
        }
      }
      log(`${file} ingested`);
    }
  })();
  if (demoted) log(`demoted ${demoted} duplicate default-slot rows (edition word-order repeats)`);

  reportErrors(ctx, 'TAGNT');
  log(`Greek word rows: ${rows}`);
}

function reportErrors(ctx: InsertCtx, label: string): void {
  if (ctx.errors.size === 0) return;
  const entries = [...ctx.errors.entries()].sort((a, z) => z[1] - a[1]);
  const total = entries.reduce((s, [, n]) => s + n, 0);
  log(`${label} WARNINGS (${total} rows affected):`);
  for (const [k, n] of entries.slice(0, 20)) log(`  ${n}x ${k}`);
  if (total > 500) throw new Error(`${label}: too many parse problems (${total}) — inspect before shipping`);
}
