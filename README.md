# Bible CLI

**A Bible study operating system for AI agents — and the humans working with them.**

`bible` is an offline command-line toolkit that lets any coding agent (Claude Code,
Codex, opencode, or anything with a shell) do serious biblical study **from the text
itself**: plain reading, original-language word study, morphology search,
cross-translation comparison, and canon-wide pattern analysis — with every claim
traceable to a query instead of to training data.

```
$ bible interlinear "John 3:16" | head -6
John 3:16
Οὕτως     Houtōs    G3779  Adv       so
γὰρ       gar       G1063  Conj      For
ἠγάπησεν  ēgapēsen  G0025  V-AIA-3S  loved
ὁ         ho        G3588  Art-NMS   -
Θεὸς      Theos     G2316  N-NMS     God

$ bible grep-morph --stem niphal --tense participle --book Isaiah --count
98 matching words
  H0539 אָמַן  8
  H5375 נָשָׂא  7
  ...

$ bible freq --strongs H1285 --by-book     # where does "covenant" concentrate?
$ bible xref "Isa 53:5" --text             # how does the canon take this verse up?
$ bible compare "Rom 8:1" -t all           # where do translations diverge?
```

Everything is **offline, deterministic, and open-licensed**: two SQLite databases
built from public-domain and CC-BY scholarly sources (see [Data](#the-data)),
downloaded once on first run.

## Why

LLMs already "know" the Bible — approximately, unverifiably, and shaped by
whatever their training data emphasized. Bible CLI gives an agent the opposite:
a set of precise instruments over the actual text, so study becomes
*evidence-based*. The agent reads the passage it cites, checks what a Greek or
Hebrew word actually means by how it is actually used, counts patterns instead
of gesturing at them, and reports what the text says as distinct from what it
concludes. The bundled methodology (`bible agent-setup`) teaches exactly that
discipline — a biblical theology workflow: plain reading → lexical analysis →
context → canonical patterns → labeled synthesis.

## Install

```sh
npm install -g bible-cli        # or: npx bible-cli ...
bible db download               # fetches the databases (~100 MB once)
bible passage "John 3:16"
```

For agents, add the study methodology to your project:

```sh
bible agent-setup claude       # writes .claude/skills/bible-study/SKILL.md
bible agent-setup generic      # appends a section to AGENTS.md (codex, opencode, …)
```

Or run it as an MCP server: `bible mcp` (stdio) exposes all commands as tools.

## Commands

Every command supports `--json` (machine-readable output), forgiving references
(`John 3:16-18`, `jn 3 16`, `1jn2:5`, `Psalm 23`, `Gen 1:1-2:3`), scoping
(`--book Isaiah`, `--book Gen-Deu`, `--book ot`), and helpful errors
(`Unknown book 'Pslams'. Did you mean: Psalms…`).

| Command | What it does |
|---|---|
| `passage <ref>` | Read a passage (`-t WEB,KJV,ASV,BSB`, `--context N`) |
| `search <query>` | FTS5 full-text search (`--phrase`, `--stem`, `--count`, AND/OR/NOT) |
| `compare <ref>` | Side-by-side translations — divergence marks interpretive decisions |
| `interlinear <ref>` | Word-by-word Hebrew/Greek with translit, Strong's, parsing, gloss |
| `original <ref>` | Original text; Greek editions: `--edition na28\|sbl\|tr\|byz\|wh\|treg` |
| `lemma <H2617\|ἀγάπη>` | Every occurrence of a lemma/Strong's across the canon |
| `word <query>` | Word study: lexicons, usage stats, gloss range, derivations; English reverse lookup |
| `morph <ref>` | Full grammatical parse of each word in a verse |
| `grep-morph` | Search by grammar: `--stem niphal --tense participle --book Isaiah` |
| `xref <ref>` | Ranked cross-references (`--text`, `--reverse`, `--min-votes`) |
| `freq` | Distribution of a Strong's/lemma/word across books or testaments |
| `cooccur` | Verses containing multiple lemmas together; passage vocabulary profiling |
| `books` · `translations` · `editions` · `morph-codes` · `licenses` | Introspection (agents discover capabilities at runtime) |
| `ref <text>` | Normalize any reference string |
| `db` · `mcp` · `agent-setup` | Data management, MCP server, agent onboarding |

## The data

All redistributable, all attributed (see `bible licenses`):

| Layer | Source | License |
|---|---|---|
| English translations | WEB, KJV, ASV ([eBible.org](https://ebible.org)), [BSB](https://berean.bible) | Public domain |
| Hebrew OT + morphology | [STEPBible TAHOT](https://github.com/STEPBible/STEPBible-Data) (WLC, dStrongs, ETCBC morphology, Ketiv/Qere) | CC BY 4.0 |
| Greek NT + morphology | [STEPBible TAGNT](https://github.com/STEPBible/STEPBible-Data) (NA/TR/Byz/SBL words with edition markers) | CC BY 4.0 |
| Interlinear | BSB interlinear tables | Public domain |
| Lexicons | STEPBible TBESH (abridged BDB) + TBESG (ext. Abbott-Smith), Dodson | CC BY 4.0 / CC0 |
| Cross-references | [OpenBible.info](https://www.openbible.info/labs/cross-references/) (~345k, vote-ranked) | CC BY |

The databases are built by a reproducible pipeline in this repo
(`npm run pipeline`) with a verification stage that checks canonical verse
counts, versification edge cases (Psalm titles, Malachi 3/4, Joel 2/3),
Ketiv/Qere handling, and morphology-code coverage — the build fails loudly
rather than shipping silently wrong data.

## Design notes

- **Verse IDs** are integers (`BBCCCVVV`; Gen 1:1 = `1001001`) on a KJV-English
  spine; Hebrew/Greek versification differences are mapped at build time and
  preserved for display. Psalm superscriptions are verse 0.
- **One row per morpheme**: Hebrew prefixes/suffixes and Greek crasis
  components are individually tagged, so `grep-morph` and frequency counts are
  exact. Analytics default to the *default text stream* (Qere; NA-stream Greek)
  so textual variants never inflate counts.
- The CLI is the single source of truth; the MCP server shells into it, so both
  interfaces always agree.

## Contributing

Issues and PRs welcome. Of particular interest: additional open-licensed
translations (non-English included), a Septuagint layer (public-domain Swete),
OT-in-NT quotation data, and versification traditions beyond Hebrew/Greek.

## License

Code: MIT. Data: see [docs/DATA-SOURCES.md](docs/DATA-SOURCES.md) and
`bible licenses` — public domain, CC BY 4.0, and CC0 components as listed above.
