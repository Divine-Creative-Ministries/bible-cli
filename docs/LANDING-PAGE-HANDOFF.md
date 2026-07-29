# BibleCLI.org — landing page handoff

## Name & suggested hero copy

**Bible CLI** — *A Bible study operating system for AI agents.*

Sub-headline: Give any AI agent — Claude Code, Codex, opencode, anything with a
shell — precise instruments over the actual text of Scripture: original-language
word study, morphology search, and canon-wide pattern analysis. Offline,
verifiable, open source. Every claim traceable to a query instead of to
training data.

## Install (the copy-paste block)

```sh
npm install -g @divine-creative-ministries/bible-cli
bible db download          # scripture databases, ~90 MB download, checksummed
bible agent-setup claude   # teach your agent the study methodology
```

Optional: `bible db download-lxx` (Septuagint + quotation links) · `bible mcp` (MCP server mode)

## Links

- GitHub: https://github.com/Divine-Creative-Ministries/bible-cli
- npm: https://www.npmjs.com/package/@divine-creative-ministries/bible-cli
- Current version: 0.1.3 · data release data-v0.1.2 · Node ≥ 20 · MIT (code)

## What it does (feature bullets — pick 4–6)

- **23 commands, all JSON-capable, fully offline** — passage reading, full-text
  search, side-by-side translation comparison, interlinear, morphology search,
  frequency and co-occurrence analysis, one-call topic dossiers (`survey`).
- **Original languages, first-class**: tagged Hebrew OT and Greek NT — 469,000
  Hebrew/Aramaic morphemes and 146,000 Greek words with full parsing and
  Strong's numbers. Ask for "every niphal participle in Isaiah" and get 98 hits.
- **A computed intertextuality engine**: 20,846 OT-in-NT links found by
  matching the Greek NT against the Septuagint — tiered as quotation /
  allusion / echo, at both verbatim and lemma level. Nothing curated, all
  reproducible.
- **Word study with real evidence**: lexicons (Brown-Driver-Briggs,
  Abbott-Smith, Dodson), usage distributions, gloss ranges, collocates —
  plus 345,000 ranked cross-references and 4,200+ disambiguated persons
  and places.
- **An agent methodology, not just tools**: the bundled text-first protocol
  makes agents discover before theorizing, attempt to falsify their own
  theses, and label what is observed vs. inferred — so answers come *from*
  the text, not from training data.
- **Trustworthy by construction**: reproducible data pipeline with a 36-check
  verification gate, checksummed downloads, and all source attribution
  shipped inside the databases (`bible licenses`).

## Show-off examples (real output, good for terminal mock-ups)

```
$ bible interlinear "John 3:16"
Οὕτως     Houtōs    G3779  Adv       so
γὰρ       gar       G1063  Conj      For
ἠγάπησεν  ēgapēsen  G0025  V-AIA-3S  loved
ὁ         ho        G3588  Art-NMS   -
Θεὸς      Theos     G2316  N-NMS     God
```

```
$ bible quotes "Psalm 110:1"        # who quotes this verse?
Matthew 22:44  ⇐  Psalms 110:1  14w
Mark 12:36     ⇐  Psalms 110:1  14w
Hebrews 1:13   ⇐  Psalms 110:1  14w
Acts 2:34      ⇐  Psalms 110:1  10w   ... (7 NT citations found)
```

```
$ bible quotes "Rev 1:7" --tier echo   # allusions, not just quotations
Revelation 1:7  ⇐  Psalms 72:17   quotation  5w   "πασαι αι φυλαι τησ γησ"
Revelation 1:7  ⇐  Genesis 12:3   allusion   5w≈  (Abrahamic blessing formula)
Revelation 1:7  ⇐  Daniel 7:13    echo       3w≈  "μετα ο νεφελη" (coming with the clouds)
```

```
$ bible survey chesed               # one-call topic dossier
H2617  חֶ֫סֶד (chesed) — goodness, kindness
occurrences: 247 in 241 verses | OT 247 / NT 0 | Psalms 127
top collocate: H5769 עוֹלָם "forever" — 57 shared verses
```

```
$ bible grep-morph --stem niphal --tense participle --book Isaiah --count
98 matching words
```

## The data (for a "what's inside" section)

| Layer | Source | License |
|---|---|---|
| English translations | BSB (default), WEB, KJV, ASV | Public domain |
| Hebrew OT + morphology | STEPBible TAHOT (Leningrad text, dStrongs, ETCBC morphology) | CC BY 4.0 |
| Greek NT + morphology | STEPBible TAGNT (NA/TR/Byzantine/SBL editions marked) | CC BY 4.0 |
| Lexicons | Brown-Driver-Briggs (Enhanced), Abbott-Smith (ext.), Dodson | PD / CC BY / CC0 |
| Cross-references | OpenBible.info, ~345k vote-ranked | CC BY |
| Proper nouns | STEPBible TIPNR, individualised | CC BY 4.0 |
| Septuagint + quotation links (optional artifact) | Swete edition + computed links | CC BY-SA 4.0 |

One line for the footer: *Code MIT. Scripture data public domain / CC BY / CC0;
the optional Septuagint artifact is CC BY-SA 4.0. Full attribution ships inside
the databases — run `bible licenses`.*

## Works with (logo row)

Claude Code · Codex CLI · opencode · any agent with a shell · any MCP client
(`bible mcp`) · and humans at a terminal.

## Boilerplate (one paragraph, for meta description / about)

Bible CLI is an open-source, offline toolkit that lets AI agents and humans
study Scripture from the text itself: four public-domain English translations,
the tagged Hebrew and Greek originals with full morphology, lexicons,
cross-references, and a computed map of where the New Testament quotes, alludes
to, and echoes the Old — all behind a fast command-line and MCP interface with
JSON output. A bundled study methodology keeps agents evidence-first: discover,
test, cite, and label every claim. Built by Divine Creative Ministries. Free
forever.
