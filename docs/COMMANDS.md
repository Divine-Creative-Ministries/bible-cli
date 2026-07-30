# Command reference

_Generated from bible-cli v0.1.7 — do not edit by hand; run `npm run gen-docs`._

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

All commands also accept `--json` for machine-readable output.
