# Store listing: ChatGPT, Claude, Cursor and Grok Bot directories

Draft material for submitting the Bible CLI MCP server to plugin directories,
written for v0.2.2. Items that could not be verified from this repository are
collected under [Unverified](#unverified).

## Listing copy

| Field | Value |
| --- | --- |
| Name | Bible CLI |
| Short description | Scripture study from the text |
| Publisher | Divine Creative Ministries |
| Support email | hello@divinecreative.org |
| Hosted endpoint | https://mcp.biblecli.org/mcp |
| Privacy policy | https://biblecli.org/privacy/ |
| Terms of service | https://biblecli.org/terms/ |
| Support page | https://biblecli.org/support/ |
| Logo | https://biblecli.org/logo-512.png |
| Category (ChatGPT) | Education & Research |
| Category (Claude, Cursor) | Use the education or research category if one is offered; no equivalent has been confirmed |

### Long description

Bible CLI gives AI assistants the text of Scripture to work from: four English
translations (public domain, except the KJV, which is under Crown patent in the
UK), tagged Hebrew and Greek originals with morphology and clause syntax,
lexicons, and cross-references. Word studies, quotation and parallel detection,
and pattern searches all run against this fixed corpus, so claims trace to a query
instead of model memory. Every tool on the hosted server is read-only, and it needs
no account.

### Example prompts

Each prompt uses hosted tools only. All the tools named were called through the
HTTP server with a local copy of the databases, and each returned results.

1. **Word study:** "Do a word study of hesed (H2617). What range of meaning does
   it have, and where in the Old Testament does it concentrate?"
   Uses `word_study`, `frequency`.
2. **Quotations and cross-references:** "Which Old Testament passages does
   Hebrews 10 quote, and what are the strongest cross-references for
   Psalm 110:1?" Uses `quotations`, `cross_references`.
3. **Passage comparison:** "Compare Romans 8:1 across translations. Where do they
   diverge, and what do the Greek editions show?" Uses `compare`, `variants`.

## Tool annotations

The hosted endpoint serves 25 tools. The local stdio server (`bible mcp`) serves
those 25 plus the 10 marked stdio-only, for 35 in total. `runMcpHttpServer` leaves
out `sql` and the `study_*` tools because it is public and stateless.

Read-only tools also get `destructiveHint: false` and `idempotentHint: true`.
The MCP spec treats those two hints as meaningful only for tools that write, but
every tool here sets all four explicitly because the unset defaults are the
pessimistic ones.

Column key: **RO** `readOnlyHint`, **Destr** `destructiveHint`, **Idem**
`idempotentHint`, **Open** `openWorldHint`.

### Data and lookup tools

Every tool in this table has the same hint values, for the same reasons:

- **RO true, Destr false:** the handler runs a CLI query command, which opens the
  databases with a read-only connection (`openCore` in `src/db/index.ts`).
- **Idem true:** nothing is stored, so repeating a call changes nothing.
- **Open false:** results come from the pinned corpus. See
  [First-run download](#first-run-download).

| Tool | Title | Surface | RO | Destr | Idem | Open | Why, from the code |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `passage` | Read Passage | hosted, stdio | true | false | true | false | `bible passage` selects verse text from the core database. |
| `search` | Search Scripture | hosted, stdio | true | false | true | false | `bible search` queries the full-text indexes; `count` only changes the output. |
| `compare` | Compare Translations | hosted, stdio | true | false | true | false | `bible compare -t all` reads one verse range across translations. |
| `interlinear` | Interlinear | hosted, stdio | true | false | true | false | `bible interlinear` reads tagged words from the study database. |
| `original` | Original-Language Text | hosted, stdio | true | false | true | false | `bible original` reads edition text from the study database. |
| `lemma` | Lemma Occurrences | hosted, stdio | true | false | true | false | `bible lemma` lists occurrences from the study database. |
| `word_study` | Word Study | hosted, stdio | true | false | true | false | `bible word` reads lexicon entries and usage counts. |
| `morph` | Verse Morphology | hosted, stdio | true | false | true | false | `bible morph` reads the parse of each word in a verse. |
| `morph_search` | Morphology Search | hosted, stdio | true | false | true | false | `bible grep-morph` filters tagged words by grammatical form. |
| `syntax_search` | Syntax Search | hosted, stdio | true | false | true | false | `bible syntax` reads the attached syntax database. That database is never auto-downloaded. |
| `cross_references` | Cross-References | hosted, stdio | true | false | true | false | `bible xref` reads stored OpenBible.info votes. |
| `frequency` | Word Frequency | hosted, stdio | true | false | true | false | `bible freq` aggregates counts with queries alone. |
| `cooccurrence` | Co-occurrence | hosted, stdio | true | false | true | false | `bible cooccur` computes co-occurrence with queries alone. |
| `quotations` | OT Quotations in the NT | hosted, stdio | true | false | true | false | `bible quotes` reads computed links from the LXX database. That database is never auto-downloaded. |
| `parallels` | Inner-Biblical Parallels | hosted, stdio | true | false | true | false | `bible parallels` reads the precomputed `text_parallels` table in the study database. |
| `similar_passages` | Similar Passages | hosted, stdio | true | false | true | false | `bible similar` computes idf-weighted lemma overlap at query time. |
| `name_lookup` | Name Lookup | hosted, stdio | true | false | true | false | `bible name` reads proper-noun records. |
| `read` | Read Sequentially | hosted, stdio | true | false | true | false | `bible read` pages chapter text. Scope `random` varies the result, but it has no side effect. |
| `outline` | Book Outline | hosted, stdio | true | false | true | false | `bible outline` summarises a book with queries alone. |
| `survey` | Topic Survey | hosted, stdio | true | false | true | false | `bible survey` combines read-only queries into one report. |
| `parse_reference` | Parse Reference | hosted, stdio | true | false | true | false | `bible ref` is a pure parser. It needs no database, so it never downloads one. |
| `variants` | Textual Variants | hosted, stdio | true | false | true | false | `bible variants` reads edition-level readings from the study database. |
| `pattern` | Formula Search | hosted, stdio | true | false | true | false | `bible pattern` searches lemma sequences and computes ratios at query time. |
| `schema` | Database Schema | hosted, stdio | true | false | true | false | `bible schema` reads `sqlite_master`. |
| `get_methodology` | Study Methodology | hosted, stdio | true | false | true | false | Returns a static string in-process, with no subprocess and no database. |
| `sql` | Read-Only SQL Query | stdio only | true | false | true | false | Read-only is enforced in `src/commands/sql.ts`; see [SQL enforcement](#sql-enforcement). |

### Study session tools (stdio only)

Sessions are JSON files under `<data dir>/studies/`. They are written only by the
local stdio server, and the hosted server does not expose these tools.

`study_resolve` is the only destructive tool. It replaces a pattern's recorded
status and keeps no history, so the old value is lost even though a later call can
set a status again. The other study tools only add content or move the cursor:
note text is never edited or deleted through MCP, the read log keeps past reads,
and `bible study delete` is not exposed as a tool. All are Open false because they
touch only those local files and the pinned databases.

When `name` is omitted, a tool acts on the most recently updated session. The
idempotent hints assume no other session is updated between repeat calls.

| Tool | Title | RO | Destr | Idem | Open | Why, from the code |
| --- | --- | --- | --- | --- | --- | --- |
| `study_start` | Start Study Session | false | false | true | false | Writes a new session file. A repeat call is rejected with "already exists" and leaves the file unchanged. |
| `study_next` | Read Next Study Unit | false | false | false | false | Advances the cursor and appends to `read_log` on every call. |
| `study_prev` | Read Previous Study Unit | false | false | false | false | Steps the cursor back and appends to `read_log` on every call. |
| `study_goto` | Move Study Cursor | false | false | true | false | Sets the cursor to the unit containing a reference, so a repeat lands in the same place. Only the `updated` timestamp changes. |
| `study_note` | Add Study Note | false | false | false | false | Appends a note with a new id on every call, so a repeat creates a duplicate. |
| `study_notes` | List Study Notes | true | false | true | false | Loads the session without the lock or `saveSession`. |
| `study_resolve` | Resolve Study Pattern | false | true | true | false | Overwrites a pattern's status in place, with no history. A repeat with the same value changes nothing except `updated`. |
| `study_coverage` | Study Coverage | true | false | true | false | Computes coverage from the loaded session and saves nothing. |
| `study_review` | Review Study Notes | true | false | true | false | Groups the loaded notes and saves nothing. |

These behaviours were checked by running each command twice against a scratch
copy of the data and comparing the session file. `study_goto`, `study_resolve`
and a rejected `study_start` left the content unchanged apart from `updated`.
`study_next`, `study_prev` and `study_note` changed it on every call.
`study_notes`, `study_coverage` and `study_review` left the file byte-identical.

### SQL enforcement

`sql` is enforced read-only in code, through four layers:

1. The connection is opened with `{ readonly: true }`, and attached databases
   inherit that.
2. `PRAGMA query_only = ON` is set for the process.
3. A statement is rejected unless better-sqlite3 reports it as both `readonly` and
   a `reader`. That blocks `DELETE ... RETURNING`, `ATTACH`, `VACUUM INTO`, and
   statements that return no rows.
4. `db.prepare` rejects multi-statement strings.

Sixteen write and escape attempts were run against a scratch copy of the
databases, including `DELETE ... RETURNING`, `ATTACH`, `VACUUM INTO`, write
PRAGMAs and `load_extension`. All were rejected, the database checksums did not
change, and no stray files appeared.

### First-run download

`openWorldHint` is false for every tool. This is a judgment call, so the exception
is recorded here.

When the stdio server calls a CLI command whose database is missing, the
`preAction` hook in `src/cli.ts` calls `autoProvision`. That downloads the core
and study databases to the data directory, once. They take about 285 MB on disk,
from a download of about 90 MB.

- **What can trigger it:** any tool that runs a database-backed command. The
  exceptions are `parse_reference`, `get_methodology`, `study_notes`,
  `study_coverage` and `study_resolve`.
- **Source:** the pinned `data-v0.2.0` GitHub release. The install aborts unless
  the file matches the release manifest's SHA-256.
- **Mirrors:** `BIBLE_CLI_RELEASE_BASE` can point at a mirror, which may omit the
  manifest. A mirror's file then gets only the SQLite integrity check.
- **Opt out:** set `BIBLE_CLI_NO_AUTO_DOWNLOAD=1`.
- **Not included:** the LXX and syntax databases are never auto-downloaded.
- **Hosted server:** the Dockerfile bakes all four databases into the image at
  build time, so this path should never run in production.

The hints stay `openWorldHint: false` and `readOnlyHint: true` because the
download installs a fixed, checksummed dataset. It does not reach an open set of
external sources, and results never depend on live external data. Strictly, the
first stdio call on a fresh machine does use the network and write files. The
tools' results and the hosted server are unaffected.

## Data licensing

Don't describe the whole hosted corpus as "public domain and CC BY". The core,
study and syntax data is public domain, CC BY 4.0 or CC0, but the hosted image
also includes the LXX artifact, which is CC BY-SA 4.0 and feeds `quotations`.
The KJV is public domain except in the UK, where a Crown patent applies, so don't
call all four translations public domain without that qualifier.
`bible licenses` lists every source and its required attribution.

## Unverified

These could not be confirmed from this repository:

- **Website pages:** the privacy, terms, support and logo URLs depend on a separate
  landing-page PR. They were not fetched.
- **Hosted endpoint:** https://mcp.biblecli.org/mcp was not contacted. It serves
  no titles or annotations until it is redeployed with this version.
- **Support mailbox:** hello@divinecreative.org was not tested.
- **Categories:** "Education & Research" is the requested ChatGPT category. The
  Claude and Cursor categories were not checked against either directory.
- **Directory requirements:** the submission rules for ChatGPT, Claude, Cursor and
  Grok Bot were not reviewed, including any authentication or review requirements.
- **Privacy claims:** the server code has no accounts and no application-level
  request logging, but any logging by the hosting platform was not checked. Confirm
  this before the privacy page makes a claim about it.
