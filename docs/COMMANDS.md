# Command reference

_Generated from bible-cli v0.2.0 — do not edit by hand; run `npm run gen-docs`._

## Reading

### `bible passage <ref>`

Read a passage.

| Option | Description |
|---|---|
| `-t, --translation <ids>` | translation(s), comma-separated or 'all' (default BSB) |
| `-c, --context <n>` | include N verses of surrounding context |

### `bible read <scope>`

Read the text sequentially, paged into context-sized chunks — study by reading, not just querying.

| Option | Description |
|---|---|
| `-t, --translation <id>` | translation (default BSB) |
| `--chunk <n>` | which chunk to read (1-based; default 1) |
| `--chunk-size <chars>` | target characters per chunk (default 12000) |

### `bible outline <book>`

The shape of a whole book in one call: every chapter with its opening words, size, and most distinctive vocabulary.

| Option | Description |
|---|---|
| `-t, --translation <id>` | translation for incipits (default BSB) |

### `bible study [command]`

Inductive reading sessions: a durable cursor over a scope plus a verse-anchored notebook — read, observe, record; search follows observation. Start with: bible study start Genesis

### `bible search <query>`

Full-text search.

| Option | Description |
|---|---|
| `-t, --translation <ids>` | translation(s) (default BSB) |
| `-b, --book <scope>` | limit to book/range/testament: 'Isaiah', 'Gen-Deu', 'ot', 'nt' |
| `--phrase` | treat the query as an exact phrase |
| `--stem` | stemmed search (matches loved/loving/loves for love) |
| `--count` | print only the match count |
| `-l, --limit <n>` | max results (default 20) |

### `bible compare <ref>`

Compare a verse across translations.

| Option | Description |
|---|---|
| `-t, --translation <ids>` | translations to compare (default 'all') |

## Original languages

### `bible interlinear <ref>`

Word-by-word original language with English.

### `bible original <ref>`

Original-language text of a passage.

| Option | Description |
|---|---|
| `--edition <e>` | Greek edition: na27\|na28\|sbl\|tr\|byz\|wh\|treg\|tyn (default: modern critical stream) |
| `--variants` | include non-default variant words with their edition flags |

### `bible syntax`

Clause search over the MACULA treebanks: who did what to whom.

| Option | Description |
|---|---|
| `--subject <q>` | Strong's number or lemma that must appear in the clause's subject |
| `--verb <q>` | Strong's number or lemma of the clause's verb (or copula) |
| `--object <q>` | Strong's number or lemma in the clause's (direct or second) object |
| `--role-any <q>` | Strong's number or lemma appearing in any role of the clause |
| `--negated` | only clauses the trees mark as negated (Hebrew לא/אל/אין, Greek οὐ/μή family) |
| `-b, --book <scope>` | limit scope: book, range, 'ot', 'nt' |
| `-l, --limit <n>` | max clauses listed (default 20) |

### `bible lemma <query>`

Occurrences of a lemma or Strong's number.

| Option | Description |
|---|---|
| `-b, --book <scope>` | limit scope: book, range, 'ot', 'nt' |
| `--count` | only counts |
| `-l, --limit <n>` | max occurrences listed (default 50) |

### `bible word <query>`

Word study: lexicon entries + usage stats.

### `bible morph <ref>`

Full parse of every word in a verse.

### `bible grep-morph`

Search by grammatical form.

| Option | Description |
|---|---|
| `--lang <l>` | H (Hebrew), A (Aramaic), G (Greek) |
| `--pos <p>` | verb, noun, adjective, pronoun, article, preposition, conjunction, particle, suffix, adverb |
| `--stem <s>` | Hebrew binyan: qal, niphal, piel, pual, hiphil, hophal, hithpael, … |
| `--tense <t>` | Greek: aorist, present, perfect…; Hebrew: perfect, imperfect, wayyiqtol, participle, … |
| `--voice <v>` | Greek: active, middle, passive, middle-passive |
| `--mood <m>` | Greek: indicative, subjunctive, optative, imperative, infinitive, participle |
| `--person <p>` | 1, 2, 3 |
| `--gender <g>` | masculine, feminine, neuter, common |
| `--number <n>` | singular, plural, dual |
| `--case <c>` | Greek: nominative, genitive, dative, accusative, vocative |
| `--state <s>` | Hebrew: absolute, construct, determined |
| `--morph <glob>` | raw morphology code GLOB, e.g. 'V-2A*' or 'HVqw*' |
| `-b, --book <scope>` | book / range / 'ot' / 'nt' |
| `--count` | only counts (by lemma) |
| `-l, --limit <n>` | max listed (default 50) |

### `bible variants <ref>`

Textual variants for a verse or short range, repackaged from the tagged data: per-edition Greek texts with edition-disputed words (NT), Masoretic Ketiv/Qere and LXX-stream readings (OT), and alternate Hebrew/Greek versification. Printed-edition-level evidence, not a manuscript apparatus.

## Pattern analysis

### `bible survey <query>`

Corpus dossier for a topic — run this FIRST in any study. Accepts a Strong's number, original-language lemma, English word, or passage.

| Option | Description |
|---|---|
| `-t, --translation <id>` | translation for English-word statistics (default BSB) |
| `-l, --limit <n>` | items per section (default 8) |

### `bible quotes <ref>`

OT-in-NT parallels computed from the Greek (LXX vs NT), in confidence tiers: quotation (5+ word run), allusion (4-word run), echo (shared rare vocabulary).

| Option | Description |
|---|---|
| `--tier <t>` | minimum tier: 'quotation' \| 'allusion' \| 'echo' (default: allusion — echoes are speculative) |
| `--min-words <n>` | minimum shared word run for run tiers (default 4) |
| `--text` | include the English text of the counterpart verses |
| `-t, --translation <id>` | translation for --text |
| `-l, --limit <n>` | max results (default 25) |

### `bible parallels <ref>`

Inner-biblical parallels within a testament, computed from original-language lemma runs (Kings↔Chronicles, Psalm doublets, Synoptics, Jude↔2 Peter), in confidence tiers: parallel (5+ lemma run), allusion (4), echo (3 rare lemmas).

| Option | Description |
|---|---|
| `--tier <t>` | minimum tier: 'parallel' \| 'allusion' \| 'echo' (default: allusion — echoes are speculative) |
| `--no-text` | omit the counterpart passage text |
| `-t, --translation <id>` | translation for counterpart text (default BSB) |
| `-l, --limit <n>` | max results (default 15) |

### `bible xref <ref>`

Ranked cross-references.

| Option | Description |
|---|---|
| `--min-votes <n>` | minimum helpfulness votes (default 5) |
| `--text` | include the target verse text |
| `-t, --translation <id>` | translation for --text (default BSB) |
| `--reverse` | also list verses that reference THIS verse |
| `-l, --limit <n>` | max results (default 20) |

### `bible freq`

Frequency distribution.

| Option | Description |
|---|---|
| `--strongs <id>` | Strong's number (true token counts from tagged text) |
| `--lemma <l>` | original-language lemma |
| `--word <w>` | English word (counts verses containing it, per translation) |
| `-t, --translation <id>` | translation for --word (default BSB) |
| `--by-book` | group by book (default) |
| `--by-testament` | group by testament |

### `bible cooccur [ref]`

Co-occurrence analysis.

| Option | Description |
|---|---|
| `--strongs <id...>` | two or more Strong's numbers: find verses containing all of them |
| `--window <w>` | 'verse' (default) or 'chapter' |
| `-l, --limit <n>` | max results (default 30) |

### `bible similar <ref>`

Passages sharing distinctive vocabulary with a passage (idf-weighted lemma overlap; lexical, not semantic).

| Option | Description |
|---|---|
| `--cross-language` | bridge Hebrew↔Greek via lexicon links (e.g. LXX-informed equivalents) |
| `-l, --limit <n>` | max results (default 15) |

### `bible name <query>`

Who/what is this? Individualised persons and places.

| Option | Description |
|---|---|
| `-l, --limit <n>` | max individuals listed (default 12) |

### `bible pattern`

Original-language formula search: find verses where a sequence of Strong's numbers and/or original-script lemmas occurs in order, with observed-vs-expected concentration by book. Original-language only — English words are not accepted (find Strong's numbers with 'bible word').

| Option | Description |
|---|---|
| `--formula <items>` | space-separated Strong's numbers (H430, G26, H2617a) and/or original-script lemmas, in order |
| `--scope <s>` | limit scope: 'ot', 'nt', a book, or a range ('Gen-Deu') |
| `--slack <n>` | max intervening words allowed between consecutive items (default 0) |
| `-l, --limit <n>` | max sample matches listed (default 20) |

## Introspection

### `bible books`

List the 66 books with codes, chapter counts, and verse-id ranges

### `bible translations`

List available translations

### `bible editions`

List Greek NT editions available for --edition filters

### `bible morph-codes`

Explain the morphology fields and their possible values

### `bible licenses`

Data sources, licenses, and required attributions

### `bible ref <text>`

Parse and normalize a reference.

### `bible schema [table]`

Show CREATE TABLE statements for the scripture databases (core + attached study/lxx/user), plus notes on verse-id encoding and query conventions.

### `bible sql <query>`

Run a read-only SQL query against the scripture databases (core, plus study/lxx/user when installed, attached under those schema names). Discover tables with 'bible schema'.

| Option | Description |
|---|---|
| `-l, --limit <n>` | max rows returned (default 200) |

## Infrastructure

### `bible db [action]`

Manage the local databases: status | download | path

### `bible mcp`

Run as an MCP (Model Context Protocol) server: stdio by default, or --http for remote connectors (Claude web/mobile, ChatGPT, ...)

| Option | Description |
|---|---|
| `--http` | serve MCP over Streamable HTTP instead of stdio |
| `--port <n>` | port for --http (default 8080, or $PORT) |

### `bible agent-setup [harness]`

Write the study-methodology guidance for an agent harness: claude | codex | opencode | generic

| Option | Description |
|---|---|
| `--dir <path>` | project directory to write into (default: cwd) |
| `--user` | install for every session on this machine instead of one project (claude: ~/.claude/skills; codex: ~/.codex/AGENTS.md; opencode: ~/.config/opencode/AGENTS.md) |
| `--stdout` | print to stdout instead of writing files |

### `bible import <path>`

Import a translation you have licensed access to (USFM folder/zip/file, or TSV lines of '<ref><TAB><text>') into a local-only database for personal study.

| Option | Description |
|---|---|
| `--id <id>` | short translation id to register (e.g. ESV, NIV84) |
| `--name <name>` | full translation name (default: the id) |
| `--language <code>` | ISO language code |
| `--remove` | remove this translation id from the local database instead of importing |

### `bible doctor`

Diagnose the installation: platform, native SQLite driver, databases, integrity. Run this first when anything misbehaves.

All commands also accept `--json` for machine-readable output.
