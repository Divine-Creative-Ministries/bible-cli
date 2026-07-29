/**
 * MCP (Model Context Protocol) stdio server exposing the same operations as
 * the CLI. Each tool invokes the CLI entry with --json and returns its output,
 * so the CLI is the single source of truth for behavior and formatting.
 * Requires the built CLI (dist/cli.js), i.e. `bible mcp` from an installed
 * package.
 */
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { METHODOLOGY } from '../commands/agent.js';

const CLI_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'cli.js');

function run(args: string[]): { text: string; isError: boolean } {
  try {
    const text = execFileSync(process.execPath, [CLI_PATH, ...args, '--json'], {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    });
    return { text, isError: false };
  } catch (e) {
    const err = e as { stderr?: string; stdout?: string; message: string };
    return { text: err.stderr || err.stdout || err.message, isError: true };
  }
}

export async function runMcpServer(): Promise<void> {
  const server = new McpServer({ name: 'bible-cli', version: '0.1.2' });

  const tool = (
    name: string,
    description: string,
    schema: Record<string, z.ZodTypeAny>,
    toArgs: (input: Record<string, unknown>) => string[],
  ): void => {
    server.tool(name, description, schema, (input: Record<string, unknown>) => {
      const result = run(toArgs(input));
      return {
        content: [{ type: 'text' as const, text: result.text }],
        isError: result.isError,
      };
    });
  };

  const ref = z.string().describe('Scripture reference, e.g. "John 3:16-18", "Psalm 23", "Gen 1:1-2:3"');
  const scope = z.string().optional().describe("Limit scope: a book ('Isaiah'), range ('Gen-Deu'), 'ot', or 'nt'");

  tool(
    'passage',
    'Read a passage in one or more translations (WEB, KJV, ASV, BSB), optionally with surrounding context verses.',
    { ref, translation: z.string().optional().describe("e.g. 'BSB' or 'BSB,KJV' or 'all' (default BSB)"), context: z.number().int().min(0).max(50).optional() },
    (i) => ['passage', String(i.ref), ...(i.translation ? ['-t', String(i.translation)] : []), ...(i.context ? ['--context', String(i.context)] : [])],
  );

  tool(
    'search',
    'Full-text search across translations. Supports phrases, AND/OR/NOT, book/testament scoping, stemmed mode, and count-only mode.',
    {
      query: z.string(),
      translation: z.string().optional(),
      book: scope,
      phrase: z.boolean().optional(),
      stem: z.boolean().optional().describe('match word stems (loved/loving for love)'),
      count: z.boolean().optional().describe('return only the count'),
      limit: z.number().int().min(1).max(500).optional(),
    },
    (i) => [
      'search', String(i.query),
      ...(i.translation ? ['-t', String(i.translation)] : []),
      ...(i.book ? ['-b', String(i.book)] : []),
      ...(i.phrase ? ['--phrase'] : []),
      ...(i.stem ? ['--stem'] : []),
      ...(i.count ? ['--count'] : []),
      ...(i.limit ? ['-l', String(i.limit)] : []),
    ],
  );

  tool('compare', 'Compare a verse or short passage across all translations; divergence marks interpretive decisions.', { ref }, (i) => [
    'compare', String(i.ref), '-t', 'all',
  ]);

  tool(
    'interlinear',
    'Word-by-word original language (Hebrew/Greek) with transliteration, Strong\'s numbers, parsing, morphology, and English gloss.',
    { ref },
    (i) => ['interlinear', String(i.ref)],
  );

  tool(
    'original',
    'Original-language text of a passage; Greek editions selectable (na28, sbl, tr, byz, wh, treg).',
    { ref, edition: z.string().optional(), variants: z.boolean().optional() },
    (i) => ['original', String(i.ref), ...(i.edition ? ['--edition', String(i.edition)] : []), ...(i.variants ? ['--variants'] : [])],
  );

  tool(
    'lemma',
    "Every occurrence of a Strong's number (H2617, G26) or original-language lemma across the canon, with optional book scoping.",
    { query: z.string().describe("Strong's number or lemma (חֶסֶד, ἀγάπη)"), book: scope, count: z.boolean().optional(), limit: z.number().int().min(1).max(500).optional() },
    (i) => ['lemma', String(i.query), ...(i.book ? ['-b', String(i.book)] : []), ...(i.count ? ['--count'] : []), ...(i.limit ? ['-l', String(i.limit)] : [])],
  );

  tool(
    'word_study',
    "Full word study: lexicon entries (abridged BDB / extended Abbott-Smith / Dodson), usage counts, gloss range, top books, derivation links. Accepts a Strong's number, original-language lemma, or English word (reverse lookup).",
    { query: z.string() },
    (i) => ['word', String(i.query)],
  );

  tool('morph', 'Full grammatical parse of every word in a verse.', { ref }, (i) => ['morph', String(i.ref)]);

  tool(
    'morph_search',
    'Search the tagged text by grammatical form (e.g. all niphal participles in Isaiah, all aorist passive imperatives).',
    {
      lang: z.enum(['H', 'A', 'G']).optional(),
      pos: z.string().optional(),
      stem: z.string().optional().describe('Hebrew binyan: qal, niphal, piel, …'),
      tense: z.string().optional(),
      voice: z.string().optional(),
      mood: z.string().optional(),
      person: z.string().optional(),
      gender: z.string().optional(),
      number: z.string().optional(),
      case: z.string().optional(),
      morph_glob: z.string().optional().describe("raw code GLOB like 'V-2A*'"),
      book: scope,
      count: z.boolean().optional(),
      limit: z.number().int().min(1).max(500).optional(),
    },
    (i) => [
      'grep-morph',
      ...(['lang', 'pos', 'stem', 'tense', 'voice', 'mood', 'person', 'gender', 'number', 'case'] as const).flatMap((k) =>
        i[k] ? [`--${k}`, String(i[k])] : [],
      ),
      ...(i.morph_glob ? ['--morph', String(i.morph_glob)] : []),
      ...(i.book ? ['-b', String(i.book)] : []),
      ...(i.count ? ['--count'] : []),
      ...(i.limit ? ['-l', String(i.limit)] : []),
    ],
  );

  tool(
    'cross_references',
    'Ranked cross-references for a passage (OpenBible.info votes), optionally with target verse text and reverse references.',
    { ref, min_votes: z.number().int().min(0).optional(), text: z.boolean().optional(), reverse: z.boolean().optional(), limit: z.number().int().min(1).max(500).optional() },
    (i) => [
      'xref', String(i.ref),
      ...(i.min_votes !== undefined ? ['--min-votes', String(i.min_votes)] : []),
      ...(i.text ? ['--text'] : []),
      ...(i.reverse ? ['--reverse'] : []),
      ...(i.limit ? ['-l', String(i.limit)] : []),
    ],
  );

  tool(
    'frequency',
    "Frequency distribution of a Strong's number, lemma, or English word across books or testaments — where does a theme concentrate?",
    { strongs: z.string().optional(), lemma: z.string().optional(), word: z.string().optional(), by_testament: z.boolean().optional() },
    (i) => [
      'freq',
      ...(i.strongs ? ['--strongs', String(i.strongs)] : []),
      ...(i.lemma ? ['--lemma', String(i.lemma)] : []),
      ...(i.word ? ['--word', String(i.word)] : []),
      ...(i.by_testament ? ['--by-testament'] : []),
    ],
  );

  tool(
    'cooccurrence',
    "Either find verses/chapters containing ALL given Strong's numbers together, or profile a passage's distinctive (rare) vocabulary.",
    { ref: z.string().optional(), strongs: z.array(z.string()).optional(), window: z.enum(['verse', 'chapter']).optional() },
    (i) => [
      'cooccur',
      ...(i.ref ? [String(i.ref)] : []),
      ...((i.strongs as string[] | undefined)?.flatMap((s) => ['--strongs', s]) ?? []),
      ...(i.window ? ['--window', String(i.window)] : []),
    ],
  );

  tool(
    'quotations',
    'OT-in-NT parallels computed from the Greek (NT vs Septuagint) in confidence tiers: quotation (5+ shared-word run), allusion (exact 4-word run), echo (shared rare vocabulary — speculative). NT ref: what it quotes; OT ref: where the NT takes it up. Requires the optional LXX database.',
    {
      ref,
      tier: z.enum(['quotation', 'allusion', 'echo']).optional().describe('minimum confidence tier (default allusion)'),
      min_words: z.number().int().min(4).max(30).optional(),
      text: z.boolean().optional(),
      limit: z.number().int().min(1).max(200).optional(),
    },
    (i) => [
      'quotes', String(i.ref),
      ...(i.tier ? ['--tier', String(i.tier)] : []),
      ...(i.min_words ? ['--min-words', String(i.min_words)] : []),
      ...(i.text ? ['--text'] : []),
      ...(i.limit ? ['-l', String(i.limit)] : []),
    ],
  );

  tool(
    'similar_passages',
    'Passages sharing distinctive (rare) vocabulary with a passage — idf-weighted lemma overlap. Lexical evidence, not semantic similarity.',
    { ref, cross_language: z.boolean().optional(), limit: z.number().int().min(1).max(100).optional() },
    (i) => ['similar', String(i.ref), ...(i.cross_language ? ['--cross-language'] : []), ...(i.limit ? ['-l', String(i.limit)] : [])],
  );

  tool(
    'name_lookup',
    'Individualised persons and places: disambiguates which Zechariah/which Antioch, with description, identifying Strong\'s, and occurrence span.',
    { query: z.string().describe('a proper name, ESV spelling') },
    (i) => ['name', String(i.query)],
  );

  tool(
    'survey',
    "Corpus dossier for a topic — the discovery-first entry point for any study. Accepts a Strong's number, lemma, English word, or passage; returns distributions, gloss ranges, collocates, distinctive vocabulary, cross-references, and quotation links in one call. Run this BEFORE forming a thesis.",
    { query: z.string(), translation: z.string().optional(), limit: z.number().int().min(3).max(30).optional() },
    (i) => ['survey', String(i.query), ...(i.translation ? ['-t', String(i.translation)] : []), ...(i.limit ? ['-l', String(i.limit)] : [])],
  );

  tool('parse_reference', 'Normalize any reference string to canonical form and verse ids.', { text: z.string() }, (i) => ['ref', String(i.text)]);

  server.resource('methodology', 'bible://methodology', () => ({
    contents: [{ uri: 'bible://methodology', mimeType: 'text/markdown', text: METHODOLOGY }],
  }));

  await server.connect(new StdioServerTransport());
}
