import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { Command } from 'commander';
import { lookupBook, makeVerseId } from '../canon.js';
import { openCore, openUserWritable, userPath } from '../db/index.js';
import { emit, fail } from '../output.js';
import { parseRef, RefError } from '../refparse/index.js';
import { parseUsfm } from '../parsers/usfm.js';

/**
 * Bring-your-own-translation: import a translation the user has licensed
 * access to (USFM files or a simple TSV) into a local-only bible-user.db.
 * Imported text stays on this machine — it is never uploaded, synced, or
 * included in shipped artifacts, and the hosted MCP endpoint never sees it.
 */

/** Read a text file with any UTF-8 BOM stripped (common in USFM exports). */
function readText(file: string): string {
  return fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
}

interface ImportRow {
  verse_id: number;
  text: string;
  bridge_end: number | null;
}

/** Reserved/shipped ids may not be overwritten by an import. */
export function validateTranslationId(raw: string, shipped: string[]): string {
  const id = raw.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9]{1,7}$/.test(id)) {
    throw new Error(`Translation id '${raw}' must be 2-8 letters/digits (e.g. ESV, NIV84, CSB).`);
  }
  if (shipped.includes(id)) {
    throw new Error(`'${id}' is a shipped translation and cannot be replaced by an import.`);
  }
  return id;
}

/** One TSV line: 'John 3:16<TAB>text' -> row, or null for blank/comment. */
export function parseTsvLine(line: string, lineNo: number): ImportRow | null {
  const t = line.trim();
  if (!t || t.startsWith('#')) return null;
  const tab = t.indexOf('\t');
  if (tab < 0) throw new Error(`line ${lineNo}: expected '<reference><TAB><text>'`);
  const refStr = t.slice(0, tab).trim();
  const text = t.slice(tab + 1).trim();
  if (!text) return null;
  let ref;
  try {
    ref = parseRef(refStr);
  } catch (e) {
    if (e instanceof RefError) throw new Error(`line ${lineNo}: ${e.message}`);
    throw e;
  }
  if (ref.kind !== 'verse' && ref.start !== ref.end) {
    throw new Error(`line ${lineNo}: '${refStr}' must reference a single verse.`);
  }
  return { verse_id: ref.start, text, bridge_end: null };
}

function collectUsfmFiles(target: string): string[] {
  const st = fs.statSync(target);
  if (st.isDirectory()) {
    const files = fs
      .readdirSync(target)
      .filter((f) => /\.(usfm|sfm|SFM|USFM)$/.test(f))
      .map((f) => path.join(target, f));
    if (files.length === 0) throw new Error(`No .usfm/.sfm files found in ${target}.`);
    return files;
  }
  return [target];
}

function extractZip(zipPath: string): { dir: string; root: string } {
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'bible-import-'));
  try {
    execFileSync('unzip', ['-o', '-q', zipPath, '-d', dest], { stdio: 'pipe' });
  } catch (e) {
    throw new Error(
      `Could not extract ${zipPath} (is 'unzip' installed?): ${(e as Error).message}. ` +
        `Unzip it yourself and pass the folder instead.`,
    );
  }
  // USFM zips often nest a single folder; descend to where the files are.
  let dir = dest;
  for (let i = 0; i < 3; i++) {
    const entries = fs.readdirSync(dir).filter((f) => !f.startsWith('.') && !f.startsWith('__MACOSX'));
    if (entries.some((f) => /\.(usfm|sfm|SFM|USFM)$/.test(f))) return { dir, root: dest };
    const dirs = entries.filter((f) => fs.statSync(path.join(dir, f)).isDirectory());
    if (dirs.length !== 1) break;
    dir = path.join(dir, dirs[0]!);
  }
  return { dir, root: dest };
}

function rowsFromUsfm(files: string[], warnings: string[]): ImportRow[] {
  const rows: ImportRow[] = [];
  for (const file of files) {
    const { bookId, verses } = parseUsfm(readText(file));
    if (!bookId) {
      warnings.push(`${path.basename(file)}: no \\id marker; skipped.`);
      continue;
    }
    const book = lookupBook(bookId);
    if (!book) {
      // deuterocanon and front/back matter fall outside the 66-book canon
      warnings.push(`${path.basename(file)}: book '${bookId}' is outside the 66-book canon; skipped.`);
      continue;
    }
    for (const v of verses) {
      if (v.chapter < 1) continue;
      rows.push({
        verse_id: makeVerseId(book.bookNum, v.chapter, v.verse),
        text: v.text,
        bridge_end: v.endVerse ? makeVerseId(book.bookNum, v.chapter, v.endVerse) : null,
      });
    }
  }
  return rows;
}

export function registerImportCommand(program: Command): void {
  program
    .command('import')
    .description(
      'Import a translation you have licensed access to (USFM folder/zip/file, or TSV lines of \'<ref><TAB><text>\') into a local-only database for personal study. Example: bible import ./esv-usfm --id ESV --name "English Standard Version"',
    )
    .argument('<path>', 'USFM folder, .zip, single .usfm file, or a .tsv/.txt of tab-separated verse lines')
    .requiredOption('--id <id>', 'short translation id to register (e.g. ESV, NIV84)')
    .option('--name <name>', 'full translation name (default: the id)')
    .option('--language <code>', 'ISO language code', 'en')
    .option('--remove', 'remove this translation id from the local database instead of importing')
    .option('--json', 'output JSON')
    .action((target: string, opts: { id: string; name?: string; language: string; remove?: boolean; json?: boolean }) => {
      const core = openCore();
      const shipped = (core.prepare('SELECT translation_id FROM translations').all() as Array<{ translation_id: string }>).map(
        (r) => r.translation_id,
      );
      let id: string;
      try {
        id = validateTranslationId(opts.id, shipped);
      } catch (e) {
        return fail(opts, (e as Error).message);
      }

      if (opts.remove) {
        const user = openUserWritable();
        const existed = user.prepare('SELECT 1 FROM translations WHERE translation_id = ?').get(id);
        if (!existed) return fail(opts, `No imported translation '${id}' found.`);
        user.transaction(() => {
          user.prepare(`DELETE FROM verse_fts WHERE translation_id = ?`).run(id);
          user.prepare(`DELETE FROM verse_fts_stem WHERE translation_id = ?`).run(id);
          user.prepare('DELETE FROM verse_texts WHERE translation_id = ?').run(id);
          user.prepare('DELETE FROM translations WHERE translation_id = ?').run(id);
        })();
        user.close();
        return emit(opts, { removed: id }, () => `Removed imported translation ${id}.`);
      }

      if (!fs.existsSync(target)) return fail(opts, `Path not found: ${target}`);

      // Parse the source into spine rows.
      const warnings: string[] = [];
      let rows: ImportRow[];
      let zipRoot: string | null = null;
      try {
        if (/\.zip$/i.test(target)) {
          const z = extractZip(target);
          zipRoot = z.root;
          rows = rowsFromUsfm(collectUsfmFiles(z.dir), warnings);
        } else if (fs.statSync(target).isDirectory() || /\.(usfm|sfm)$/i.test(target)) {
          rows = rowsFromUsfm(collectUsfmFiles(target), warnings);
        } else {
          const content = readText(target);
          if (/^\\id\s/m.test(content)) {
            rows = rowsFromUsfm([target], warnings);
          } else {
            rows = content
              .split(/\r?\n/)
              .map((l, i) => parseTsvLine(l, i + 1))
              .filter((r): r is ImportRow => r !== null);
          }
        }
      } catch (e) {
        return fail(opts, (e as Error).message);
      } finally {
        // never leave an extracted copy of licensed text in the temp dir
        if (zipRoot) fs.rmSync(zipRoot, { recursive: true, force: true });
      }
      if (rows.length === 0) return fail(opts, 'No verses could be parsed from the input.');

      // Keep only rows that land on the canonical spine; report the rest.
      const spine = new Set(
        (core.prepare('SELECT verse_id FROM verses').all() as Array<{ verse_id: number }>).map((r) => r.verse_id),
      );
      const kept: ImportRow[] = [];
      const seen = new Set<number>();
      let offSpine = 0;
      let dupes = 0;
      for (const r of rows) {
        if (!spine.has(r.verse_id)) {
          offSpine++;
          continue;
        }
        if (seen.has(r.verse_id)) {
          dupes++;
          continue;
        }
        seen.add(r.verse_id);
        kept.push(r);
      }
      if (kept.length === 0) return fail(opts, 'No parsed verses matched the canonical verse spine.');
      if (offSpine > 0) warnings.push(`${offSpine} verse(s) fell outside the KJV-numbering spine and were skipped.`);
      if (dupes > 0) warnings.push(`${dupes} duplicate verse reference(s) skipped (first occurrence kept).`);

      const user = openUserWritable();
      user.transaction(() => {
        user.prepare(`DELETE FROM verse_fts WHERE translation_id = ?`).run(id);
        user.prepare(`DELETE FROM verse_fts_stem WHERE translation_id = ?`).run(id);
        user.prepare('DELETE FROM verse_texts WHERE translation_id = ?').run(id);
        user
          .prepare(
            'INSERT OR REPLACE INTO translations (translation_id, name, language, source_file, imported_at) VALUES (?,?,?,?,?)',
          )
          .run(id, opts.name ?? id, opts.language, path.resolve(target), new Date().toISOString());
        const insText = user.prepare('INSERT INTO verse_texts (translation_id, verse_id, text, bridge_end) VALUES (?,?,?,?)');
        const insFts = user.prepare('INSERT INTO verse_fts (text, translation_id, verse_id) VALUES (?,?,?)');
        const insStem = user.prepare('INSERT INTO verse_fts_stem (text, translation_id, verse_id) VALUES (?,?,?)');
        for (const r of kept) {
          insText.run(id, r.verse_id, r.text, r.bridge_end);
          // index (not display) text normalizes ' to \u2019, matching how the
          // search command normalizes queries against the shipped texts
          const ix = r.text.replace(/'/g, '\u2019');
          insFts.run(ix, id, r.verse_id);
          insStem.run(ix, id, r.verse_id);
        }
      })();
      user.close();

      const books = new Set(kept.map((r) => Math.floor(r.verse_id / 1_000_000))).size;
      const coverage = ((kept.length / spine.size) * 100).toFixed(1);
      emit(
        opts,
        {
          imported: id,
          name: opts.name ?? id,
          verses: kept.length,
          books,
          spine_coverage_pct: Number(coverage),
          warnings,
          database: userPath(),
          note: 'Personal use of a translation you have licensed access to. This database stays on your machine — it is never uploaded, shared, or included in bible-cli releases.',
        },
        () =>
          [
            `Imported ${id} (${opts.name ?? id}): ${kept.length} verses across ${books} books (${coverage}% of the verse spine).`,
            ...warnings.map((w) => `  ! ${w}`),
            `Stored locally in ${userPath()} — personal use only; never uploaded or shared.`,
            `Try it: bible passage "John 3:16" -t ${id} · bible compare "Rom 8:1" · BIBLE_TRANSLATION=${id} makes it the default.`,
          ].join('\n'),
      );
    });
}
