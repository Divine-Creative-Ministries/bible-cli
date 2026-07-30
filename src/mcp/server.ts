/**
 * MCP (Model Context Protocol) stdio server exposing the same operations as
 * the CLI. Each tool invokes the CLI entry with --json and returns its output,
 * so the CLI is the single source of truth for behavior and formatting.
 * Requires the built CLI (dist/cli.js), i.e. `bible mcp` from an installed
 * package.
 */
import { execFile } from 'node:child_process';
import * as http from 'node:http';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { METHODOLOGY } from '../commands/agent.js';

const CLI_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'cli.js');
const execFileP = promisify(execFile);

async function run(args: string[]): Promise<{ text: string; isError: boolean }> {
  try {
    const { stdout } = await execFileP(process.execPath, [CLI_PATH, ...args, '--json'], {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    });
    return { text: stdout, isError: false };
  } catch (e) {
    const err = e as { stderr?: string; stdout?: string; message: string };
    return { text: err.stderr || err.stdout || err.message, isError: true };
  }
}

/**
 * Condensed text-first protocol, injected automatically into any client that
 * honors MCP server instructions (the Claude apps do). The full methodology is
 * the bible://methodology resource and the get_methodology tool.
 */
const INSTRUCTIONS = `Bible study tools over the actual scripture corpus (tagged Hebrew/Greek originals, four public-domain translations, lexicons, cross-references, computed OT-in-NT links). Work text-first: every quotation, word meaning, and pattern claim must come from tool output in this conversation — never from memory; your training data may generate hypotheses, but only the corpus settles them.

Match evidence to the claim: simple lookups need one call (passage); word-meaning claims need usage (word, lemma, interlinear); studies, themes, and any canon-wide claim need the full protocol — start with survey (the corpus's own structure, before any thesis), read whole books with read/outline rather than only searching, then trace connections with quotations, cross_references, and cooccurrence. For every thesis, also run the search that could DISPROVE it, and report the result. Check base rates (frequency, search with count) before calling a pattern significant.

In answers, distinguish: OBSERVED (text, with references) / PATTERN (counted, with the query) / INFERENCE (your conclusion) — and label anything from outside the corpus as interpretive tradition, not established from this text. Report negative results plainly. Where translations diverge (compare), an interpretive decision is hiding — check the original.`;

/**
 * Build a fully-registered server instance (one per stdio session or HTTP
 * request). Local-only options — stdio (a local client's own machine) only,
 * never the HTTP server (public, stateless, shared): includeSql exposes the
 * arbitrary read-only SQL tool; includeLocalState adds the study-session
 * tools, which read and write local files.
 */
export function buildServer(options: { includeSql?: boolean; includeLocalState?: boolean } = {}): McpServer {
  const server = new McpServer({ name: 'bible-cli', version: '0.1.9' }, { instructions: INSTRUCTIONS });

  const tool = (
    name: string,
    description: string,
    schema: Record<string, z.ZodTypeAny>,
    toArgs: (input: Record<string, unknown>) => string[],
  ): void => {
    server.tool(name, description, schema, async (input: Record<string, unknown>) => {
      const result = await run(toArgs(input));
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
    'syntax_search',
    "Clause-level 'who did what to whom' search over the MACULA treebanks: constrain the clause's subject, verb, and/or object by Strong's number or lemma, optionally negated clauses only (tree-marked Hebrew לא/אל/אין, Greek οὐ/μή). E.g. subject H430 + verb H2142 finds every clause where God remembers. Requires the optional syntax database (bible db download-syntax).",
    {
      subject: z.string().optional().describe("Strong's number (H430) or lemma in the clause's subject"),
      verb: z.string().optional().describe("Strong's number (H2142, G4100) or lemma of the clause's verb"),
      object: z.string().optional().describe("Strong's number or lemma in the clause's object"),
      role_any: z.string().optional().describe("Strong's number or lemma appearing in any clause role"),
      negated: z.boolean().optional().describe('only clauses marked negated in the trees'),
      book: scope,
      limit: z.number().int().min(1).max(200).optional(),
    },
    (i) => [
      'syntax',
      ...(i.subject ? ['--subject', String(i.subject)] : []),
      ...(i.verb ? ['--verb', String(i.verb)] : []),
      ...(i.object ? ['--object', String(i.object)] : []),
      ...(i.role_any ? ['--role-any', String(i.role_any)] : []),
      ...(i.negated ? ['--negated'] : []),
      ...(i.book ? ['-b', String(i.book)] : []),
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
    'parallels',
    'Inner-biblical parallels WITHIN a testament, computed from shared original-language lemma runs (Kings↔Chronicles, Psalm doublets, Synoptic parallels, Jude↔2 Peter) in confidence tiers: parallel (5+ lemma run, near-verbatim), allusion (4-lemma run), echo (3 rare lemmas — speculative). Consecutive pairing verses are merged into ranges. For OT-quoted-in-NT links use the quotations tool instead.',
    {
      ref,
      tier: z.enum(['parallel', 'allusion', 'echo']).optional().describe('minimum confidence tier (default allusion)'),
      text: z.boolean().optional().describe('include the counterpart passage text (default true)'),
      translation: z.string().optional(),
      limit: z.number().int().min(1).max(200).optional(),
    },
    (i) => [
      'parallels', String(i.ref),
      ...(i.tier ? ['--tier', String(i.tier)] : []),
      ...(i.text === false ? ['--no-text'] : []),
      ...(i.translation ? ['-t', String(i.translation)] : []),
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
    'read',
    "Read Scripture sequentially in context-sized chunks — study by reading, not just querying. Returns flowing chapter text with verse markers and navigation to the next chunk. Use for book-scale questions: read first, let themes emerge, then interrogate with the other tools.",
    { scope: z.string().describe("a book ('Isaiah'), range ('Isaiah 40-55'), or 'random'"), translation: z.string().optional(), chunk: z.number().int().min(1).optional(), chunk_size: z.number().int().min(2000).max(60000).optional() },
    (i) => [
      'read', String(i.scope),
      ...(i.translation ? ['-t', String(i.translation)] : []),
      ...(i.chunk ? ['--chunk', String(i.chunk)] : []),
      ...(i.chunk_size ? ['--chunk-size', String(i.chunk_size)] : []),
    ],
  );

  tool(
    'outline',
    "A whole book's shape in one call: every chapter with opening words, verse count, and most distinctive vocabulary — the flip-through view before reading in depth.",
    { book: z.string(), translation: z.string().optional() },
    (i) => ['outline', String(i.book), ...(i.translation ? ['-t', String(i.translation)] : [])],
  );

  tool(
    'survey',
    "Corpus dossier for a topic — the discovery-first entry point for any study. Accepts a Strong's number, lemma, English word, or passage; returns distributions, gloss ranges, collocates, distinctive vocabulary, cross-references, and quotation links in one call. Run this BEFORE forming a thesis.",
    { query: z.string(), translation: z.string().optional(), limit: z.number().int().min(3).max(30).optional() },
    (i) => ['survey', String(i.query), ...(i.translation ? ['-t', String(i.translation)] : []), ...(i.limit ? ['-l', String(i.limit)] : [])],
  );

  tool('parse_reference', 'Normalize any reference string to canonical form and verse ids.', { text: z.string() }, (i) => ['ref', String(i.text)]);

  tool(
    'variants',
    'Textual variants for a verse or short range (max 5 verses): per-edition Greek texts with edition-disputed words (NT), Masoretic Ketiv/Qere and LXX-stream readings (OT), alternate Hebrew/Greek versification. Printed-edition-level evidence, not a manuscript apparatus.',
    { ref },
    (i) => ['variants', String(i.ref)],
  );

  tool(
    'pattern',
    "Original-language formula search: verses where a sequence of Strong's numbers and/or original-script lemmas occurs in order (with optional slack words between items), plus observed-vs-expected concentration by book. Original-language only — no English words.",
    {
      formula: z.string().describe("space-separated Strong's numbers and/or original-script lemmas in order, e.g. 'H2142 H1285'"),
      scope: z.string().optional().describe("'ot', 'nt', a book, or a range ('Gen-Deu')"),
      slack: z.number().int().min(0).max(10).optional().describe('max intervening words between consecutive items (default 0)'),
      limit: z.number().int().min(1).max(200).optional(),
    },
    (i) => [
      'pattern', '--formula', String(i.formula),
      ...(i.scope ? ['--scope', String(i.scope)] : []),
      ...(i.slack !== undefined ? ['--slack', String(i.slack)] : []),
      ...(i.limit ? ['-l', String(i.limit)] : []),
    ],
  );

  tool(
    'schema',
    "CREATE TABLE statements for the scripture databases (core + attached study/lxx/user), with notes on verse-id encoding, the words-table is_default rule, and FTS query syntax.",
    { table: z.string().optional().describe('show only this table') },
    (i) => ['schema', ...(i.table ? [String(i.table)] : [])],
  );

  if (options.includeSql) {
    tool(
      'sql',
      "Run a single read-only SQL query against the scripture databases (core, plus study/lxx/user attached under those schema names). Discover tables with the schema tool. Local stdio server only.",
      { query: z.string().describe('a single read-only SQL statement'), limit: z.number().int().min(1).max(10000).optional().describe('max rows (default 200)') },
      (i) => ['sql', String(i.query), ...(i.limit ? ['-l', String(i.limit)] : [])],
    );
  }

  if (options.includeLocalState) {
    const sessionName = z.string().optional().describe('session name (default: most recently updated session)');

    tool(
      'study_start',
      "Begin an inductive reading session over a scope — a durable cursor plus a verse-anchored notebook. Read unit by unit (study_next), record what you observe (study_note), and let recurrences surface patterns. Scope: a book, range ('Gen-Deu'), 'ot', 'nt', or 'bible'.",
      {
        scope: z.string().describe("'Genesis', 'Gen-Deu', 'Isaiah 40-55', 'ot', 'nt', or 'bible'"),
        name: z.string().optional().describe('session name (default: derived from the scope)'),
        translation: z.string().optional(),
        unit: z.enum(['chapter', 'chunk']).optional().describe('reading unit (default chapter)'),
        chunk_size: z.number().int().min(2000).max(60000).optional().describe('target characters per unit for unit=chunk'),
        bare: z.boolean().optional().describe('blind reading: flowing text without verse numbers'),
      },
      (i) => [
        'study', 'start', String(i.scope),
        ...(i.name ? ['--name', String(i.name)] : []),
        ...(i.translation ? ['-t', String(i.translation)] : []),
        ...(i.unit ? ['--unit', String(i.unit)] : []),
        ...(i.chunk_size ? ['--chunk-size', String(i.chunk_size)] : []),
        ...(i.bare ? ['--bare'] : []),
      ],
    );

    tool(
      'study_next',
      "Read the next unit of the active study session: the text, a continuity tail of the previous unit, progress, and RECURRENCES — open patterns/questions whose distinctive vocabulary reappears in this unit.",
      { name: sessionName },
      (i) => ['study', 'next', ...(i.name ? ['--name', String(i.name)] : [])],
    );

    tool('study_prev', 'Step back and re-read the previous unit of the study session.', { name: sessionName }, (i) => [
      'study', 'prev', ...(i.name ? ['--name', String(i.name)] : []),
    ]);

    tool(
      'study_goto',
      'Move the study cursor so the next read is the unit containing a reference.',
      { ref, name: sessionName },
      (i) => ['study', 'goto', String(i.ref), ...(i.name ? ['--name', String(i.name)] : [])],
    );

    tool(
      'study_note',
      "Record a notebook entry anchored to exact verses. Types: observation, question, pattern (testable claim, starts open), counterexample (requires against), conclusion. Omit refs to anchor to the unit just read — notes without verse anchors are rejected.",
      {
        text: z.string().describe('the observation in your own words'),
        type: z.enum(['observation', 'question', 'pattern', 'counterexample', 'conclusion']),
        refs: z.string().optional().describe('comma-separated anchors: "Gen 22:11, Gen 46:2" (single verses or short ranges)'),
        against: z.number().int().optional().describe('for counterexamples: the note id this evidence tests'),
        name: sessionName,
      },
      (i) => [
        'study', 'note', String(i.text),
        '--type', String(i.type),
        ...(i.refs ? ['--refs', String(i.refs)] : []),
        ...(i.against !== undefined ? ['--against', String(i.against)] : []),
        ...(i.name ? ['--name', String(i.name)] : []),
      ],
    );

    tool(
      'study_notes',
      'List the study notebook, optionally filtered by type or open patterns only.',
      {
        type: z.enum(['observation', 'question', 'pattern', 'counterexample', 'conclusion']).optional(),
        open: z.boolean().optional().describe('only open patterns'),
        name: sessionName,
      },
      (i) => [
        'study', 'notes',
        ...(i.type ? ['--type', String(i.type)] : []),
        ...(i.open ? ['--open'] : []),
        ...(i.name ? ['--name', String(i.name)] : []),
      ],
    );

    tool('study_coverage', 'Read/unread units per book for the session scope, unread gaps, and notebook stats.', { name: sessionName }, (i) => [
      'study', 'coverage', ...(i.name ? ['--name', String(i.name)] : []),
    ]);

    tool(
      'study_review',
      'The synthesis input: all notes anchored up to the cursor (or a given reference), grouped by type.',
      { through: z.string().optional().describe('include notes anchored at or before this reference'), name: sessionName },
      (i) => ['study', 'review', ...(i.through ? ['--through', String(i.through)] : []), ...(i.name ? ['--name', String(i.name)] : [])],
    );
  }

  server.resource('methodology', 'bible://methodology', () => ({
    contents: [{ uri: 'bible://methodology', mimeType: 'text/markdown', text: METHODOLOGY }],
  }));

  server.tool(
    'get_methodology',
    'The full text-first study methodology (the condensed version is in the server instructions). Fetch when starting a substantial study.',
    {},
    () => ({ content: [{ type: 'text' as const, text: METHODOLOGY }] }),
  );

  return server;
}

/** stdio mode: local clients (Claude Desktop, Claude Code, Cursor, ...). */
export async function runMcpServer(): Promise<void> {
  await buildServer({ includeSql: true, includeLocalState: true }).connect(new StdioServerTransport());
}

/**
 * Streamable HTTP mode: remote connectors (Claude web/mobile, ChatGPT, ...).
 * Stateless: a fresh server + transport per request, so any instance can
 * serve any request — no sessions, no state, safe behind a load balancer.
 */
export async function runMcpHttpServer(port: number): Promise<void> {
  const httpServer = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version');
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return;
    }
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, server: 'bible-cli-mcp' }));
      return;
    }
    if (url.pathname !== '/' && url.pathname !== '/mcp') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found — MCP endpoint is POST /mcp' }));
      return;
    }
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const raw = Buffer.concat(chunks).toString('utf8');
      const body: unknown = raw.length ? JSON.parse(raw) : undefined;
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on('close', () => {
        void transport.close();
      });
      await buildServer({ includeSql: false }).connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (e) {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32603, message: (e as Error).message }, id: null }));
      }
    }
  });
  await new Promise<void>((resolve) => httpServer.listen(port, resolve));
  process.stderr.write(`bible-cli MCP listening on http://0.0.0.0:${port}/mcp (health: /healthz)\n`);
}
