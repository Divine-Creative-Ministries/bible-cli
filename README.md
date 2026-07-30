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
npm install -g @divine-creative-ministries/bible-cli
```

That's it — the scripture databases download automatically on first use
(~90 MB, checksummed; set `BIBLE_CLI_NO_AUTO_DOWNLOAD=1` to manage them
manually with `bible db download`). Or try it with zero install:

```sh
npx @divine-creative-ministries/bible-cli passage "John 3:16"
```

For agents, add the study methodology to your project:

```sh
bible agent-setup claude          # this project: .claude/skills/bible-study/SKILL.md
bible agent-setup claude --user   # every session on this machine: ~/.claude/skills/
bible agent-setup generic         # appends a section to AGENTS.md (codex, opencode, …)
```

Or run it as an MCP server: `bible mcp` (stdio) exposes all commands as tools.

## Commands

Every command supports `--json` (machine-readable output), forgiving references
(`John 3:16-18`, `jn 3 16`, `1jn2:5`, `Psalm 23`, `Gen 1:1-2:3`), scoping
(`--book Isaiah`, `--book Gen-Deu`, `--book ot`), and helpful errors
(`Unknown book 'Pslams'. Did you mean: Psalms…`).

<!-- commands:start -->
| Command | What it does |
|---|---|
| `passage <ref>` | Read a passage. |
| `read <scope>` | Read the text sequentially, paged into context-sized chunks — study by reading, not just querying. |
| `outline <book>` | The shape of a whole book in one call: every chapter with its opening words, size, and most distinctive vocabulary. |
| `search <query>` | Full-text search. |
| `compare <ref>` | Compare a verse across translations. |
| `interlinear <ref>` | Word-by-word original language with English. |
| `original <ref>` | Original-language text of a passage. |
| `lemma <query>` | Occurrences of a lemma or Strong's number. |
| `word <query>` | Word study: lexicon entries + usage stats. |
| `morph <ref>` | Full parse of every word in a verse. |
| `grep-morph` | Search by grammatical form. |
| `survey <query>` | Corpus dossier for a topic — run this FIRST in any study. Accepts a Strong's number, original-language lemma, English word, or passage. |
| `quotes <ref>` | OT-in-NT parallels computed from the Greek (LXX vs NT), in confidence tiers: quotation (5+ word run), allusion (4-word run), echo (shared rare vocabulary). |
| `xref <ref>` | Ranked cross-references. |
| `freq` | Frequency distribution. |
| `cooccur [ref]` | Co-occurrence analysis. |
| `similar <ref>` | Passages sharing distinctive vocabulary with a passage (idf-weighted lemma overlap; lexical, not semantic). |
| `name <query>` | Who/what is this? Individualised persons and places. |
| `books` | List the 66 books with codes, chapter counts, and verse-id ranges |
| `translations` | List available translations |
| `editions` | List Greek NT editions available for --edition filters |
| `morph-codes` | Explain the morphology fields and their possible values |
| `licenses` | Data sources, licenses, and required attributions |
| `ref <text>` | Parse and normalize a reference. |
| `db [action]` | Manage the local databases: status \| download \| path |
| `mcp` | Run as an MCP (Model Context Protocol) server over stdio |
| `agent-setup [harness]` | Write the study-methodology guidance for an agent harness: claude \| codex \| opencode \| generic |
<!-- commands:end -->

## The data

All redistributable, all attributed (see `bible licenses`):

| Layer | Source | License |
|---|---|---|
| English translations | WEB, KJV, ASV ([eBible.org](https://ebible.org)), [BSB](https://berean.bible) | Public domain |
| Hebrew OT + morphology | [STEPBible TAHOT](https://github.com/STEPBible/STEPBible-Data) (WLC, dStrongs, ETCBC morphology, Ketiv/Qere) | CC BY 4.0 |
| Greek NT + morphology | [STEPBible TAGNT](https://github.com/STEPBible/STEPBible-Data) (NA/TR/Byz/SBL words with edition markers) | CC BY 4.0 |
| Lexicons | [BDB Enhanced](https://github.com/unfoldingWord/Brown-Driver-Briggs-Enhanced) (full Brown-Driver-Briggs), STEPBible TBESG (ext. Abbott-Smith), Dodson | PD + CC BY / CC BY 4.0 / CC0 |
| Cross-references | [OpenBible.info](https://www.openbible.info/labs/cross-references/) (~345k, vote-ranked) | CC BY |
| Proper nouns | [STEPBible TIPNR](https://github.com/STEPBible/STEPBible-Data) (individualised persons/places) | CC BY 4.0 |
| Septuagint† | [Swete edition](https://github.com/nathans/lxx-swete) + computed NT quotation links | CC BY-SA 4.0 |

† The LXX ships as a **separate optional artifact** (`bible db download-lxx`) because
its digitization carries CC BY-SA; the core and study databases stay public
domain + CC BY only.

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
- **Quotation detection is computed, not curated**, in three labeled confidence
  tiers — *quotation* (5+ identical words in a row), *allusion* (4+ word or
  lemma run), *echo* (gated 3-lemma runs or shared rare vocabulary; speculative
  by design and excluded from default output) — at two match levels: surface
  (verbatim) and lemma (inflection-independent, via a dictionary derived from
  the tagged NT; marked ≈). The lemma level is what catches Rev 1:7 ⇐ Dan 7:13.
  Purely thematic connections remain `bible xref`'s domain.
- **The methodology is a text-first protocol**: three lanes matching evidence
  to the claim (lookup / word-passage / study), discovery-before-thesis via
  `survey`, mandatory falsification attempts, and provenance tags separating
  what is OBSERVED, what is PATTERN, and what is INFERENCE — with anything
  from outside the corpus labeled as interpretive tradition.

## Known limitations (honest edges)

- `--edition` Greek texts are reconstructed from TAGNT's word-set + variant
  apparatus — accurate wording, but not a facsimile of a printed edition's
  punctuation or orthography.
- ~80 Aramaic Strong's numbers lack formal lexicon entries (gaps in the BDB
  mapping); their entries are synthesized from the tagged text's own glosses
  and labeled as such.
- English reverse lookup (`bible word lovingkindness`) is heuristic: lexicon
  glosses first, then which original words underlie verses containing the
  English word.
- The Swete LXX digitization lacks Ecclesiastes; Daniel uses Theodotion (which
  the NT normally follows).

## Roadmap

- **Hosted remote MCP endpoint** (`mcp.biblecli.org`) — a Streamable HTTP mode
  for `bible mcp` plus a small stateless read-only deployment, so the Claude
  mobile/web apps and ChatGPT can connect via a custom-connector URL with no
  install at all. Planned as the next milestone after the BibleCLI.org launch.
- Semantic similarity via local embeddings
- Pericope/discourse boundaries for context-aware `--context`
- Versification traditions beyond Hebrew/Greek (Vulgate)
- Additional open-licensed translations, non-English included
- Syntax-aware search (MACULA clause/phrase trees)

PRs welcome.

## License

Code: MIT. Data: see [docs/DATA-SOURCES.md](docs/DATA-SOURCES.md) and
`bible licenses` — public domain, CC BY 4.0, and CC0 in the core/study
databases; the optional LXX artifact is CC BY-SA 4.0.
