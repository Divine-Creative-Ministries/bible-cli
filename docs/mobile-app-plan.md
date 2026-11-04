# Bible CLI for iOS & Android — product spec & MVP plan

Status: **draft v3 for review** · Owner: Bailey Mullens (Divine Creative Ministries) · 2026-11-04

> **One line:** a free, offline Bible app with Greek and Hebrew one tap away,
> including from any English word in the BSB. Your AI agents (**ChatGPT,
> Claude, and Grok Bot as equal, first-class platforms**) can read your
> highlights, notes, and reading history and save research back into the app,
> under a permission mode you choose for each agent. They stay grounded in the
> actual text through the existing bible-cli tools.
>
> **Launch target:** iOS App Store + Google Play, **and** listings in the
> ChatGPT, Claude, and Grok Bot connector directories, together (§12).

The platform and store details described here were checked on 2026-11-03/04,
mostly against third-party summaries. Items marked ⚠️ need confirming on a
device or in official docs during Phase 0.

---

## 1. Decisions locked

| # | Topic | Decision |
|---|---|---|
| 1 | Platforms (agents) | **ChatGPT, Claude, and Grok Bot are equal, first-class platforms.** Grok Bot is xAI's standalone Grok Bot app; each bot runs on its own cloud computer. It connects over **MCP only** (no webhook push for now), replies in its own app, and saves back with `save_research`. |
| 2 | Launch | Listings in **all three connector directories** (ChatGPT, Claude Connectors Directory, Grok Bot Marketplace), launched **alongside** the iOS and Android apps. |
| 3 | Audience | **AI power users first.** General church members come later, once connector setup is smoother. |
| 4 | Translations | **Public domain at launch, with BSB built in and the default** (WEB, KJV, ASV downloadable). **Request a translation** in Settings; demand decides which licenses to pursue. |
| 5 | Business model | **Free, supported by donations.** DCM is a 501(c)(3). No features behind a paywall. |
| 6 | Agent writes | Agents can save **notes, reading plans, and research**. Each connected agent has a **permission mode**: **Full access (default)**, Approval required, or Read only. |
| 7 | Full-access limit | **100 saves per day per agent** by default; research counts toward it. The user can **turn the limit off** per agent. Saves past the limit go to the **approval inbox**. **Undo lasts 30 days.** |
| 8 | Saved research | A **`save_research`** tool lets any agent save research done with the user (title, body, passage refs). It appears in **Journal → Research** and on that agent's page. |
| 9 | Note visibility | **New notes are visible to agents by default.** The user can hide any note. **No private vault.** |
| 10 | Consent | An **explicit consent step in onboarding**, covering faith-related personal data (GDPR Art. 9), before any agent can read the user's notes or other personal data (§2.2). |
| 11 | Greek & Hebrew | **In the MVP**, including **tapping an English word in BSB** to see its Hebrew or Greek word, and seeing how BSB translates any Hebrew or Greek word. The source is the Berean BSB translation tables (§3). |
| 12 | Originals pack | **Not bundled.** Onboarding offers it, **switched on by default**. Users who skip it can get it from Settings or the first time they tap *Original* or an English word. |
| 13 | Brand | The app is called **Bible CLI** (same brand as the CLI and MCP server). |
| 14 | Repos | The app lives in its **own new repo**. Shared Bible code (canon, refparse, …) is **published as a small npm package**. |
| 15 | Platforms (apps) | **iOS and Android launch together.** |

### Derived defaults (reversible; flag if you disagree)

- **Framework:** Expo (React Native) with TypeScript. One codebase for both stores, and it uses the shared package directly.
- **Backend:** Cloudflare Workers, with a **Durable Object per user** (each user gets their own SQLite database) and the Workers OAuth provider.
- **Agent endpoint:** **one MCP server for every platform**, `https://my.biblecli.org/mcp`. It accepts **OAuth 2.1** (for the directory listings) **and personal access tokens** (for Grok Bot custom connectors, Claude Code, scripts) (§5.5). The existing **`mcp.biblecli.org` stays public, needs no login, and keeps running unchanged on Railway.**
- **Reading never calls a server.** Bible text and the Greek/Hebrew data ship as offline packs built by this repo's pipeline.
- **Safety rule for Full access:** agents can **create** items but can **never edit or delete anything the user wrote**. Everything an agent saves is labeled with the agent's name and can be undone.

---

## 2. Product

### Positioning vs YouVersion and Logos

| | YouVersion | Logos | **Bible CLI** |
|---|---|---|---|
| Your data readable by the AI you already use | — | — (has its own AI) | **Yes: ChatGPT, Claude, Grok Bot, through one MCP server** |
| Agents save their research into your Bible app | — | — | **Yes, with a per-agent permission mode** |
| Agent answers grounded in the text | n/a | closed | **Text-first methodology and verification tools** |
| Original languages | minimal | deep, paid | **Free, offline, tap any BSB word** |
| Openness | closed | closed | **Open data, open source, export anytime** |
| Translation library | huge | huge | **Public domain at launch**; requests decide what comes next |

### 2.1 Navigation: 4 tabs

1. **Read**
   - BSB is built in and the default; WEB, KJV, ASV download on demand. Parallel view of two translations. Search sits inside Read (offline full-text search).
   - **Greek & Hebrew:** tap any English word in BSB, use the interlinear toggle, or long-press a verse and tap *Original* (§3).
   - Long-press verse(s) to open the action bar: **Highlight · Note · Original · Send to… · Copy with context · Compare**.
   - Cross-reference markers (OpenBible.info data, already in the core database).
   - Reading history is recorded automatically at chapter level. A visible **Pause history** toggle lives in the Read menu and in Settings.
2. **Journal** (segments: Highlights | Notes | Research)
   - **Highlights:** filter by color, tag, or book. The user names their colors (a **color legend**, e.g. yellow = "promise", red = "command"), and agents receive that legend.
   - **Notes:** Markdown, optionally tied to verse ranges. Types: `journal` (default), `observation`, `question`, `prayer`, `conclusion`.
     - **Visible to agents by default.** An eye icon on each card hides or shows it; hidden notes show a closed eye.
   - **Research:** longer write-ups saved by agents (or pasted by the user). Each shows its title, passage chips, the agent and date, and a link back to the conversation when provided.
     - Tapping a passage chip opens it in Read.
     - Research has the same eye switch (visible by default).
   - Anything an agent created carries a **"Saved by Claude"** (or "Suggested by…") label.
3. **Plans** (Plans | History)
   - **Plans:** a scope (e.g. "Isaiah 40–55"), a unit (chapter or chunk), a pace (units per day), and a start date. This reuses the study-session unit model, extracted into the shared package (§9).
   - **History:** a timeline of chapters read, with no pressure from streaks. Each entry can be deleted, and the whole history can be cleared.
4. **Agents**
   - **From your agents:** a single feed of everything agents did.
     - Saved items (Full access), each with **Undo**.
     - **Pending approvals** (Approval required agents, or saves over the daily limit), each with **Approve / Edit then approve / Reject**.
     - Badge count for pending approvals.
   - **Connections:** a page for each agent with its mode, data access, daily limit, activity log, and **Revoke** (§5.4).
   - **Add an agent:** guides for **ChatGPT · Claude · Grok Bot** (first-class), plus Grok (grok.com), Claude Code, and others. **Create token** for custom connectors (§5.6).
   - **Sent:** a history of every passage shared with an agent.

### 2.2 Onboarding (first launch)

1. **Welcome:** "BSB is built in and works offline. No account needed to read."
2. **Greek & Hebrew:** **"Download Greek & Hebrew (≈ N MB)"**, switched **on by default**.
   - Downloads in the background. On cellular data it asks before downloading.
   - If skipped: available in **Settings → Translations**, or offered (one-sheet prompt) the first time the user taps *Original* or an English word.
3. **Your notes and AI agents (explicit consent, GDPR Art. 9).** This is a full screen with plain-language text and **no pre-selected choice**:
   - What's shared: notes, research, highlights, plans, and reading history can be read by **agents you connect** (ChatGPT, Claude, Grok Bot, …).
   - Defaults: **new notes are visible to agents unless you hide them**, and **connected agents get Full access** (they can save notes, plans, and research) unless you change it per agent.
   - Why it's sensitive: **this material can reveal your religious beliefs**, which data-protection law treats as sensitive personal data.
   - Third parties: once an agent reads it, **that platform's own data policies apply**.
   - Control: you can hide any note, change or revoke any agent, and **withdraw this consent anytime** in Settings → Agents.
   - Buttons: **"I agree — let agents I connect read my notes and study data"** · **"Not now"**.
   - Consent is recorded with the text version, timestamp, and account (or device, until sign-in), and synced.
   - **If "Not now":**
     - Agents can still connect and use the Scripture tools and `save_*`.
     - They can also read passages the user explicitly sends.
     - **Every personal-data read tool returns "consent needed"**, pointing to the app.
     - The consent screen reappears when the user first taps *Add an agent*.
   - **Withdrawing** immediately turns off personal-data reads for every agent. Connections remain until revoked.
4. **Sign in (optional):** Sign in with Apple / Google / email. Needed for sync and agents. Skippable.
5. **Connect an agent (optional):** opens the guides in §5.7.

### 2.3 Settings

- Translations: download/remove packs · **Greek & Hebrew pack** · **Request a translation** (§4)
- Agents: **consent status (withdraw / give)** · "Agents can see new notes" (**on** by default) · default mode for new connections (**Full access**) · default daily limit (**100**, can be turned off) · pause history · default history window
- Account: sign in/out · **export all data (JSON)** · **delete account** (required by both app stores and the connector directories)
- **Support Bible CLI** (donations, §7) · About & licenses (generated from `bible licenses`) · privacy policy · terms · support

### Works without an account

Reading, Greek/Hebrew, highlights, notes, plans, and history all work **offline with no account**. An account is needed only for sync, connecting agents, and Send-to-inbox. When the user signs in, local data is uploaded and merged.

---

## 3. Greek & Hebrew (MVP), including English-word alignment

### 3.1 Data we have

- `bible-study.db` → `words` has **615,371 rows** (606,950 with `is_default = 1`), one per morpheme (TAHOT Hebrew/Aramaic, TAGNT Greek). Each row has a verse id, word number, surface form, transliteration, lemma, Strong's number, a source-text gloss, and decoded parsing.
- Lexicons are in the same database: abridged BDB (Hebrew), extended Abbott-Smith/TBESG and Dodson (Greek).
- **Nothing links these words to English words** in BSB, WEB, KJV, or ASV today. Alignment data closes that gap.

### 3.2 Alignment options evaluated (2026-11-03)

| Option | What it is | License | Verdict |
|---|---|---|---|
| **Berean BSB translation tables** (`bereanbible.com/bsb_tables.tsv`, 85 MB; also `.xlsx`) | The BSB publisher's own word table: **443,626 rows**, one per Hebrew/Aramaic/Greek word, each with Strong's, parsing, its **BSB English rendering** ("the heavens"), and both original-word order and BSB English order (Heb/Greek Sort, BSB Sort) | BSB text dedicated to the **public domain 2023-04-30**; the terms say "licensing is not required for any use" | **✅ Recommended.** Full OT + NT, made with the BSB itself, and published alongside the `bsb.txt` we already ship |
| Clear Bible / Biblica manual alignments (`github.com/Clear-Bible/Alignments`) | Hand-corrected word-level alignments: `WLCM-BSB` (OT), `SBLGNT-BSB` and `BGNT-BSB` (NT), keyed to MACULA word IDs, plus tokenized BSB targets | **CC BY 4.0** (fits our policy) | **Backup / cross-check.** Finer, many-to-many links, but the BSB revision may lag ours and it needs a MACULA → TAHOT/TAGNT word map |
| eBible **KJV** Strong's tags (`eng-kjv2006` USFM, already downloaded by `pipeline/download.sh`) | The classic hand tagging, `\w beginning\|strong="H7225"\w*`; ~314k tagged words; our USFM parser currently strips the tags | Public domain | **Follow-up** for KJV tap-a-word: map by Strong's number plus position within the verse |
| eBible **WEB / ASV** Strong's tags | Tags are present on every word but **wrong in many places** (e.g. Gen 1:1 "God" → H8064 "heavens", "the" → H1254 "create") | Public domain | **❌ Don't use** |
| Generate alignments ourselves (statistical aligner with Strong's anchors) | Feasible for WEB/ASV, but accuracy on function words is weak; needs a gold test set and weeks of tuning | — | **❌ Not for the MVP.** Revisit for WEB/ASV, labeled "approximate" |

### 3.3 Prototype results (Berean tables vs data-v0.2.0)

Run on 2026-11-03 with a throwaway script, not committed.

- **Matching original words to our `words` rows**, by Strong's number in word order:
  - **Hebrew/Aramaic: 99.65%** (99.43% even by simple position)
  - **Greek: 96.62%** (by simple position only 81.9%; the Berean Greek base text orders some words differently from TAGNT's default edition)
  - Overall, 98.7% of Berean Strong's numbers occur in the right verse.
- **Locating BSB English spans in our BSB verse text:** 366,100 spans found by a naive sequential search. **84% of verses rebuild exactly** after basic cleanup. The rest differ only by the tables' markup (`[ ]` and `{ }` around supplied words, `...` continuation markers, `vvv` placeholders for moved words, quote and dash spacing), which a real stage normalizes.
- **Untranslated original words** (rendering "-", e.g. the object marker אֵת): 32,198. They're shown as "not translated separately".
- **Pack size** (offsets into the BSB verse text plus word refs, with no duplicate English text): **10.2 MB on disk, 4.3 MB gzipped.**

### 3.4 Licensing

- The BSB is public domain. The tables are published on the same free-downloads page under the same terms.
- **We ship only what's ours to need:** English span positions, BSB order, and the link to our own TAHOT/TAGNT word rows. **We do not ship the tables' Greek/Hebrew text or parsing columns.** The Greek column marks NA/ECM readings, and we already have our own original-language data.
- ⚠️ Send Berean a one-line email asking them to confirm the translation tables fall under the 2023 public-domain dedication. Low risk; it's a courtesy and a paper trail.
- Because it's public domain, alignment data can also be **served to agents on the hosted MCP** with no restriction.

### 3.5 MVP interaction

- **Tap an English word (BSB):**
  - The app highlights the whole English phrase that renders one original word (e.g. "the heavens" → הַשָּׁמַיִם) and opens the **word sheet**.
  - Words BSB added for English sense are marked "added for English sense".
  - Other translations use the verse route below until KJV tags land.
- **Interlinear toggle:** each verse shows the original line with word glosses. Tapping an original word highlights its English phrase in the BSB line.
- **Verse → Original:** long-press a verse and tap *Original* to open the verse interlinear in a sheet.
- **Word sheet:**
  - Surface form, transliteration, lemma, Strong's number.
  - **Parsing in plain English**, gloss, and lexicon entry (BDB / Abbott-Smith / Dodson).
  - **"In this verse: 'the heavens'"** and **"BSB translates this word as: heavens 3xx · sky 1xx · …"**. The renderings are tappable and filter the occurrences.
  - Occurrence count, a book distribution chart, and **All occurrences** (offline).
  - Actions: **Send word study to…** · **Add to note**.
- **Rendering:**
  - Hebrew is right-to-left with vowel points.
  - Fonts must be OFL-licensed (Ezra SIL, Gentium Plus, Noto Serif Hebrew/Greek) ⚠️ confirm the licenses.
  - Dynamic Type and VoiceOver/TalkBack must work on the word sheet.
- **Greek words not in the default edition** (~3% that don't match) fall back to TAGNT's other-edition rows, or are labeled "differs in our Greek base text".

### 3.6 Pipeline & agent work (this repo)

| Work item | Estimate |
|---|---|
| `download.sh`: fetch `bsb_tables.tsv` with `bsb.txt` as one snapshot, pinned by sha256 (the URLs aren't versioned) | ½ day |
| New `pipeline/stages/alignment.ts`: parse, normalize the markup, locate spans in core BSB text, Strong's-guided in-order matching to `words` (Hebrew by word number; Greek default edition, then other editions). Writes `bsb_alignment(verse_id, eng_start, eng_end, word_num, match_kind)` and `bsb_renderings(strongs, lemma, rendering, count)` into `bible-study.db` | 4–6 days |
| `stages/verify.ts` gates: BSB rebuilds from spans ≥ 99% after normalization with exact fixtures (Gen 1:1, Ps 23:1, John 3:16); Strong's agreement ≥ 99.5% Hebrew / ≥ 96% Greek (tighten as matching improves); spans inside verse bounds and non-overlapping | 1–2 days |
| CLI + MCP: `interlinear` gains a BSB-rendering column; new `bible align <ref>` / `align` tool; `word_study` and `lemma` gain "BSB renderings"; tests | 3–5 days |
| Mobile: the originals pack includes alignment and renderings; data release `data-v0.3.0` via `release-data.sh`, bump `DATA_VERSION` | 1–2 days |
| **Total** | **≈ 1.5–2.5 weeks** for one engineer (app UI is separate, in M1) |

**Pack size:** alignment adds about **10 MB on disk / 4–5 MB compressed** to the originals pack. The words and lexicon slice is still to be measured in M0.

---

## 4. Request a translation

**Purpose:** let users ask for the translations they want, and use the count of requests as evidence of which publisher licenses (ESV, NIV, NLT, CSB, NASB, LSB, non-English…) are worth pursuing.

- **Entry points:** Settings → Translations → *Request a translation*, and a "Don't see yours?" row at the bottom of the translation picker.
- **Form:**
  - A searchable list of common translations, plus **Other** (free text).
  - Optional: language, and a one-line "why".
  - Optional checkbox **"Notify me if it becomes available"** (requires an account).
- **Copy must not promise anything:** "Requests help us decide which publishers to approach. Licensing isn't always possible."
- **Accounts:** works without one. Signed in, it's one vote per user per translation; signed out, one per device per translation, using a hashed install ID.
- **Storage:** one shared D1 table (aggregate data, **not** in the per-user Durable Object). It is never joined to notes, highlights, or reading data:
  `translation_requests(id, translation_key, other_text, language, reason, voter_hash, notify_user_id NULL, created_at)`.
- **Reporting:** start with a small admin query or page listing ranked requests with counts per week, and optionally a weekly email digest.
- **Licensing reminder:** a licensed translation added later is **displayed only**. Agents always receive public-domain text (§8).

---

## 5. Agent integration

### 5.1 One MCP server for every platform

```
 ChatGPT ─┐                              ┌─ OAuth 2.1 (directory listings, connectors)
 Claude  ─┼──▶ my.biblecli.org/mcp ◀─────┤
 Grok Bot ┘    (Cloudflare Worker)       └─ Bearer personal access token (Grok Bot custom connectors,
               enforces consent + mode       Claude Code, Codex, Cursor, scripts)
               ├─ user tools ──▶ per-user Durable Object (SQLite)
               └─ Scripture tools ──forward──▶ mcp.biblecli.org/mcp (Railway, unchanged)
 Bible CLI app ──sync API──▶ same Worker / Durable Object
```

- **One URL, one listing per directory.** Claude Free reportedly allows only one custom connector, and each directory lists one server.
- **The gateway forwards Scripture tools from upstream.** It reads the upstream `tools/list`, caches it, and forwards calls under the same names and schemas. It adds the **tool annotations** the directories require (§5.3). Upstream gets a shared-secret header so the gateway can be rate-limited separately from public traffic.
- **The gateway's server instructions** are the upstream instructions plus a user-data block:
  > "Highlights, notes, and research are the user's own material. Quote them as the user's, never as Scripture. Scripture claims still come only from the Scripture tools. **Save research or notes only when the user asks, or after you offer and the user agrees.** Tie everything you save to the passages it discusses, and keep the OBSERVED / PATTERN / INFERENCE labels."
- **Small changes needed in this repo:**
  - Export `INSTRUCTIONS` from `src/mcp/server.ts`.
  - Add annotations to the upstream tool definitions so the public server and the gateway agree.

### 5.2 Read tools

Available in every mode. Results respect the user's **consent** (§2.2), the agent's data access (§5.4), the per-item eye switch, and the history window.

| Tool | Data setting | Returns |
|---|---|---|
| `get_reading_context` | Reading history | Current position, recent chapters (within the window), active plans and their cursor |
| `list_highlights(ref?, scope?, color?, tag?, since?, limit?)` | Highlights | Highlights as verse-id ranges with canonical refs, plus the **color legend** |
| `search_notes(query?, ref?, type?, since?)` / `get_note(id)` | Notes | Notes not hidden by the user |
| `search_research(query?, ref?, agent?, since?)` / `get_research(id)` | Research | Saved research not hidden by the user, from **any** agent. Claude can build on what ChatGPT found |
| `list_plans()` | Plans | Plans and their progress |
| `get_share(id)` / `get_inbox(latest?, limit?)` | Shares | Passages the user explicitly sent. **Works without the onboarding consent**, because sending is itself an explicit act |
| Scripture tools (forwarded) | — | The existing ~25 tools, plus the new **`align`** tool and BSB renderings in `word_study` (§3.6) |

### 5.3 Write tools and annotations

Write tools are available in Full access and Approval required. **They're omitted from `tools/list` for Read-only agents.**

| Tool | Input | Notes |
|---|---|---|
| `save_research` | `title` (≤120), `body_md` (≤50k chars), `refs` (**required**, ≥1 verse or range), `summary?` (≤280), `tags?`, `method?` (queries/tool calls used), `conversation_url?`, `related?` | The main write-back. Shown in Journal → Research |
| `save_note` | `text`, `type`, `refs` (**required for agents**), `title?` | Must be tied to verses, the same rule as the study notebook |
| `save_plan` | `name`, `scope`, `unit`, `pace`, `start?` | Scope is parsed with the shared refparse |

- **Responses:** `{ status: "saved" | "pending_approval", reason?: "mode" | "daily_limit", id, kind, app_url }`. The agent tells the user accurately what happened.
- **Validation:** the server parses `refs` with `bible-core` and rejects anything it can't parse, with a helpful error. Sizes are capped, and Markdown is stored as text and rendered safely.
- **Create-only in the MVP:** no `update_*` or `delete_*` tools.
- **MCP prompts:** `study_shared_passage`, `reflect_on_recent_reading`, `save_this_study`.

**Annotations on every tool** (required by the Claude directory; ChatGPT asks for a justification of each hint). Both requirements are met from one table, generated from the tool definitions:

| Tools | `readOnlyHint` | `destructiveHint` | `idempotentHint` | `openWorldHint` | Justification (for the ChatGPT submission) |
|---|---|---|---|---|---|
| All Scripture tools, all user read tools | `true` | `false` | `true` | `false` | Reads a closed, offline Scripture corpus or the user's own Bible CLI data; no side effects, no external systems |
| `save_research`, `save_note`, `save_plan` | `false` | `false` | `false` | `false` | Creates a new item in the user's own Bible CLI journal; never modifies or deletes existing data; undoable by the user for 30 days |

Every tool also gets a human-readable `title`.

### 5.4 Per-agent permission modes

Every connected agent, whether OAuth or token, gets a mode chosen in the app and **enforced on the server** by the gateway on every call.

| Mode | Read tools | Write tools | Where writes land |
|---|---|---|---|
| **Full access** *(default)* | ✅ (within consent + data access) | ✅ | Saved immediately, labeled with the agent, shown in **From your agents** with **Undo (30 days)** |
| **Approval required** | ✅ | ✅ | **Pending approvals**: saved only when the user approves (or edits, then approves) |
| **Read only** | ✅ | hidden | — |

**Per-agent settings page** (Agents → *Claude*):

```
Claude                                      Connected Nov 3 · last used 9:14
────────────────────────────────────────────────────────────────────────────
Mode            ● Full access   ○ Approval required   ○ Read only
Can read        [✓] Reading history   window: [30 days ▾]
                [✓] Highlights   [✓] Notes (not hidden)   [✓] Research
                [✓] Plans        [✓] Things you send
Daily limit     [✓] 100 saves/day — after that, saves wait for approval
Notifications   [✓] When Claude saves or suggests something
Activity        Today: read 3 notes · saved "Abide in John 15" (research)  ›
                Rename · Revoke access
```

**Defaults for a new connection:**

| Setting | Default |
|---|---|
| Mode | **Full access** (changeable in Settings → Agents → *Default mode for new connections*) |
| Reading history | on, **30-day** window |
| Highlights / Notes / Research / Plans / Shares | on (personal-data reads also require the onboarding consent) |
| Daily limit | **100 saves per agent per day**, counting notes, plans, **and research**; **can be turned off** per agent |
| Notifications | on |

**Rules:**
- **Every mode:** agents can't read hidden items and can't edit or delete user-authored content. Revoking takes effect on the next call.
- **Full access safety net:**
  - Everything saved is labeled with the agent and appears in **From your agents**.
  - Each saved item has **Undo** (soft delete, restorable for **30 days**), and there's an **Undo all from this agent today** action.
  - Save #101 of the day goes to **Pending approvals** with `reason: "daily_limit"`. It's never dropped.
  - The first connection triggers a push: *"Claude is connected with Full access. Change?"*
- **Changing modes:** the change applies on the next tool call. A stale write call from an agent that's now Read only gets a clear error pointing to the app.
- **OAuth scopes stay coarse.** The real policy is stored on the server per agent, so the user can change a mode or data access without reconnecting.
- **Follow-up:** per-type mode overrides; letting agents edit their own items.

### 5.5 Authentication: one server that satisfies all three platforms

`my.biblecli.org/mcp` supports **two credential types on the same endpoint**, and both map to an agent record in the user's Agents tab with the same modes, limits, and logs.

**A. OAuth 2.1** (ChatGPT directory, Claude directory, Grok Bot Marketplace / Cursor catalog ⚠️, Grok.com connectors)

| Requirement | Implementation |
|---|---|
| Transport | **Streamable HTTP** at `POST /mcp` (JSON responses; SSE optional) |
| **401 discovery contract** | Unauthenticated or invalid-token requests get **`401`** with `WWW-Authenticate: Bearer resource_metadata="https://my.biblecli.org/.well-known/oauth-protected-resource"` |
| Protected Resource Metadata (**RFC 9728**) | `/.well-known/oauth-protected-resource` → `resource`, `authorization_servers: ["https://my.biblecli.org"]`, `scopes_supported` |
| Authorization Server Metadata (**RFC 8414**) | `/.well-known/oauth-authorization-server` (plus an `openid-configuration` alias if a client needs it ⚠️) → endpoints, `code_challenge_methods_supported: ["S256"]`, `client_id_metadata_document_supported: true` |
| Client identity | **CIMD** (Client ID Metadata Documents, the preferred method) **and** **DCR (RFC 7591)** at `/register` (ChatGPT's directory reportedly requires DCR); public clients use `token_endpoint_auth_method: none` |
| **PKCE** | Required, `S256` only |
| Resource indicators (**RFC 8707**) | `resource` parameter honored; tokens are audience-bound to `https://my.biblecli.org/mcp` |
| Grants | `authorization_code` + rotating `refresh_token`. No `client_credentials` (ChatGPT doesn't support it) |
| Redirect allowlist | `https://claude.ai/api/mcp/auth_callback`, `https://claude.com/api/mcp/auth_callback` ⚠️, ChatGPT connector callbacks (current + legacy) ⚠️, Cursor / Grok Bot callbacks ⚠️, loopback `http://127.0.0.1:*` for CLI clients (RFC 8252) |
| Consent page | Sign in (Apple / Google / email; **plus password login for the reviewer demo account only**, since reviewers can't use 2FA or magic links), then an itemized screen naming the agent (verified from CIMD/DCR metadata), its data access, and its mode (preset to Full access). **Allow** / **Customize**. If the onboarding consent wasn't given, this screen asks for it |
| Domain verification | Serve OpenAI's verification token on `my.biblecli.org` ⚠️ (exact path in the portal) |

**B. Personal access tokens** (Grok Bot custom connectors, Claude Code, Codex, Cursor, scripts)

- **Created in the app:** Agents → *Create token* → name (e.g. "My Grok Bot"), mode, data access, daily limit, optional expiry. The token is **shown once**, with a copy button and setup steps for that platform.
- **Format:** `bcli_pat_<random>`. The prefix lets the gateway tell token types apart and supports secret scanning. Tokens are stored as hashes; the app shows only the last 4 characters.
- **Sent as** `Authorization: Bearer bcli_pat_…` to the same `/mcp` URL. A bad or revoked token gets the same 401 contract.
- **Revoke or regenerate** from the agent's page, with immediate effect. *Last used* and the activity log appear as for OAuth agents.
- **Consent copy at creation:** "This token will live on that service (e.g. Grok Bot's cloud computer). Anyone who has it gets this agent's access. Revoke it here anytime."

### 5.6 Grok Bot

- **What it is:** xAI's standalone Grok Bot app. Each bot runs on its own cloud computer and adds MCP servers by **name + URL + optional headers**, with no OAuth client-ID field.
- **Two ways in:**
  1. **Grok Bot Marketplace listing** (launch target, §12). Install from the marketplace. The auth flow follows the marketplace/Cursor catalog's MCP OAuth support ⚠️ (verify in M0); if it only takes headers, the listing's setup text points to *Create token*.
  2. **Custom connector (works today):** in the app, Agents → *Add Grok Bot* → *Create token*. Then in Grok Bot → MCP servers → Add:
     - Name `Bible CLI`
     - URL `https://my.biblecli.org/mcp`
     - Header `Authorization: Bearer bcli_pat_…`
- **Flow:**
  1. The user sends a passage from the app (it lands in the inbox), or just asks Grok Bot.
  2. Grok Bot calls `get_inbox` / the Scripture tools and **replies in the Grok Bot app**.
  3. It saves back with `save_research`, subject to its mode and daily limit.
- **Webhook push is out of scope for now.** It's listed under follow-ups as optional, revisited if Grok Bot or other agents gain inbound triggers.

### 5.7 Connecting each platform

| Platform | Tier | How (MVP) | After directory approval |
|---|---|---|---|
| **ChatGPT** | First-class | Developer mode → add server → OAuth ⚠️ (plan-gated; write tools may be limited on some plans) | Listed in the ChatGPT directory; one-click connect |
| **Claude** (web, desktop, mobile) | First-class | Settings → Connectors → Add custom connector → URL → OAuth (added on the web first; Free plan reportedly allows 1 custom connector) | Listed in the Connectors Directory; one-click connect |
| **Grok Bot** | First-class | Custom connector with a personal access token (§5.6) | Listed in the Grok Bot Marketplace |
| Grok (grok.com) | Supported | Connectors → Custom → URL → OAuth ⚠️ (paid plans) | — |
| Claude Code / Codex / Cursor / scripts | Supported | OAuth via `claude mcp add --transport http …`, or a token header | Cursor via the Grok Bot Marketplace target "Cursor" (§12) |

Each in-app guide shows a copy-URL or copy-token button, a short screen recording, and a **"Test connection"** step that reports which tools work (useful when a ChatGPT plan blocks writes).

---

## 6. Send to…

**Rule:** chat apps can't receive pushed messages. Sending means **handing off text** and **dropping the passage in the inbox** for `get_share` / `get_inbox`.

**Share text** (works even when no connector is set up):

```
Let's study John 15:1–11 (BSB). I highlighted v.5 as "promise".
My question: what does "abide" mean here?
[bible-cli share shr_8f3k2m9q1z]

1 "I am the true vine, and My Father is the keeper of the vineyard. …"
```

| Path | iOS | Android | MVP? |
|---|---|---|---|
| **Copy with context, then open the app** | ✅ | ✅ | **Yes** (the fallback that always works) |
| **OS share sheet** | ✅ the user picks the target | ✅ | **Yes** |
| **Direct one-tap target** ("Send to Claude") | ❌ can't preselect the target app | ✅ `Intent.setPackage(...)` when that app is installed | **Yes (Android)** |
| **Inbox via MCP** (`get_inbox`): "check what I sent" in ChatGPT, Claude, or Grok Bot | ✅ | ✅ | **Yes** (core; equal for all three) |
| **Prompt-prefill URLs** (`chatgpt.com/?q=`, `claude.ai/new?q=`, `grok.com/?q=`) | ⚠️ | ⚠️ | Only behind a remote flag (undocumented) |
| Webhook push | — | — | **Later / optional** |
| App Intents / Shortcuts | later | — | Follow-up |

- **Target picker:** **ChatGPT · Claude · Grok Bot** (equal prominence, in alphabetical order) · Other (share sheet) · Copy. The last target used is remembered.
- ⚠️ Whether the Grok Bot app accepts shared text or has a URL scheme to open it is to be checked in M0. Copy plus inbox works regardless.
- **Trademarks:** platform names appear in plain text only, with no third-party logos and nothing implying endorsement.

---

## 7. Donations (DCM 501(c)(3))

- Settings → **Support Bible CLI**, plus a quiet, dismissible prompt at most once per quarter. No features are gated, ever.
- **Launch path: link out** to `biblecli.org/donate` (hosted giving page). ⚠️ Confirm the current wording of App Store guideline 3.2.1(vi) and 3.2.2 for nonprofits and link-outs, and Google Play's Payments policy exemption for donations.
- **Later option:** Apple's approved-nonprofit route allows **in-app donations via Apple Pay**. It requires enrolling in Apple's nonprofit program.

---

## 8. Data, licensing, offline, sync

- **Packs**, built by this repo's pipeline (`pipeline/stages/mobile.ts`) and released through `scripts/release-data.sh` with manifest, checksums, and the verify gate. The app pins a `DATA_VERSION`.
  - **BSB: built into the app.** `bible-mobile-BSB.db`: verse text plus full-text search.
  - **WEB / KJV / ASV:** downloaded on demand. ⚠️ Measure sizes; the full core database is about 93 MB, so it isn't an option.
  - `bible-mobile-xref.db`: cross-references (bundled or on demand, depending on size).
  - **`bible-mobile-originals.db`:** Greek & Hebrew words, lexicon slice, BSB alignment and renderings (§3). **Not bundled**; offered in onboarding (on by default). The alignment adds about 4–5 MB compressed.
- **Verse ids:** highlights, notes, research, shares, and plans store `BBCCCVVV` verse-id ranges, so they work in any translation. Alignment spans are character offsets into the BSB verse text of the pinned data version.
- **Licensing:**
  - BSB (text **and translation tables**), WEB, KJV, ASV: public domain.
  - TAHOT, TAGNT, and the lexicons: CC BY (BDB itself is public domain). The About screen shows the attribution.
  - **"World English Bible"** is a trademark: the text must not be modified under that name.
  - ⚠️ **KJV in the UK** (Crown letters patent): decide on the UK storefront.
  - **LXX (CC BY-SA) is not in the app.**
  - Licensed translations later are **displayed only**.

### Sync

- Every record has a ULID, `updated_at`, and a soft-delete marker. Conflicts are resolved last-write-wins per record.
- `POST /sync { cursor, ops[] } → { ops[], cursor }` against the user's Durable Object. Items saved by agents arrive through the same stream, nudged by a silent push.

### Core records (per-user Durable Object)

| Record | Key fields |
|---|---|
| `highlight` | id, verse_start, verse_end, color_key, tags[], timestamps |
| `color_legend` | key, label, hex |
| `note` | id, title?, body_md, type, anchors[], **agent_visible (default true)**, source, timestamps |
| `research` | id, title, summary?, body_md, anchors[] (≥1), tags[], method?, conversation_url?, related[], **agent_visible (default true)**, source, timestamps |
| `reading_event` | book, chapter, translation, read_at |
| `plan` | id, name, scope, unit, units[], pace, start_date, cursor, source |
| `share` | id (≥10 random characters), range, translation, text, highlight/note snapshot, question, target, created_at |
| `pending_item` | id, kind (note \| plan \| research), payload, agent_id, reason (mode \| daily_limit), status (pending \| approved \| edited \| rejected \| expired), timestamps |
| `agent` | id, kind (oauth \| token), client_id / token hash + last4, display name, **mode**, data_access{…}, history_window, **daily_limit (100 \| null = off)**, notify, expires_at?, last_used, revoked_at |
| `consent` | kind (agent_personal_data), text_version, granted_at, withdrawn_at |
| `activity` | agent_id, tool, item ids or counts, ts (**content is never logged**) |

`source` is `user` or `{ agent_id, display_name }`. It drives the "Saved by…" label and Undo.

---

## 9. Repos & the shared package

| Repo | Contents |
|---|---|
| **`bible-cli`** (this repo) | CLI, public MCP server, data pipeline (**including mobile packs and the BSB alignment stage**), data releases, and the shared package as an npm workspace at `packages/bible-core` |
| **New app repo** (name TBD, e.g. `bible-cli-app`) | `apps/mobile` (Expo) · `apps/gateway` (Cloudflare Worker: MCP gateway, OAuth + tokens, sync) · `packages/api-schema` (sync records + MCP tool schemas and annotations, shared by app and gateway, and the source for the submission tool table) |

**`@divine-creative-ministries/bible-core`**
- **Contents:**
  - `canon`, `refparse`, reference formatting, scope parsing.
  - The **plan-unit builder** (the pure parts of `commands/reading.ts` and `study/session.ts`).
  - Morph-code → plain-English parsing labels.
- **Constraints:** zero runtime dependencies, ESM, no Node APIs.
- **Releases:** its own version and tag (e.g. `core-v0.1.0`), published via the same npm Trusted Publishing (OIDC) workflow. The CLI pins an exact version.
- **Follow-up:** update CLAUDE.md release rules once this exists.

---

## 10. Privacy & trust

- **Explicit consent first** (§2.2), then per-agent grants. Notes and research are visible by default **only after consent**, and each agent reads only what its grant allows. The eye switch is one tap on every card.
- **Agents with Full access only add, never change.** Every item is labeled with its agent and can be undone for 30 days. The daily limit (100, can be turned off) routes surplus writes to approval.
- **Prompt injection:** text in notes or shares could try to steer an agent into saving junk. *Mitigations:* create-only, provenance labels, Undo plus bulk Undo, the daily limit, and a one-tap switch to Approval required.
- **Tokens:** stored as hashes, prefixed for secret scanning, revocable, optional expiry. The creation copy warns that a token lives on the agent's service.
- **Activity log:** e.g. "Grok Bot read 3 notes · saved 1 research · Tue 9:14". Visible in the app and exportable.
- **Regulatory:**
  - Faith notes count as religious-belief data, a **GDPR Art. 9** special category. The explicit onboarding consent, the per-agent grant, and the ability to withdraw are the basis.
  - Apple's guideline 5.1.2 requires disclosure and permission before personal data goes to third-party AI.
  - The ChatGPT directory requires the privacy policy to **state specifically what data the app accesses through ChatGPT** (and the same is written for Claude and Grok Bot).
  - ⚠️ Legal review of the consent text and privacy policy in M4.
- **No analytics on content.** Crash reporting is limited to stack traces only.
- **Data export** (JSON) and **account deletion** (in-app and on the web).

---

## 11. App Store & Google Play specifics

- **Name:** "Bible CLI" ⚠️ check availability on both stores. Suggested subtitle: *"Scripture for you and your AI"*.
- **Avoiding rejection for minimum functionality (4.2) or duplicate apps (4.3):** an offline reader, **Greek & Hebrew from any BSB word**, a journal, plans, and the agent integration are substantive. Lead the screenshots with the word sheet, the Agents tab, and Send.
- **Required:** Sign in with Apple (since Google sign-in is offered) · in-app account deletion · privacy label including **Sensitive Info (religious beliefs)** · Google Play Data safety form · privacy policy URL.
- **Age rating:** ⚠️ complete the questionnaires honestly (Scripture includes mature themes). This should be consistent with the ChatGPT directory's "general audiences including teens" requirement. Accounts require users to be 13 or older (open question 6).
- **Trademarks:** ChatGPT, Claude, and Grok Bot are named in plain text only, with no logos.
- **Demo account** shared with the connector directories (§12.2).

---

## 12. Connector store launch

**Goal:** be listed in the **ChatGPT directory, the Claude Connectors Directory, and the Grok Bot Marketplace**, and approved on the **App Store and Google Play**, launching together.

### 12.1 Requirements matrix

✅ = required · ➖ = not required / n/a · ⚠️ = unverified (third-party summaries checked 2026-11-04)

| Requirement | ChatGPT directory | Claude directory | Grok Bot Marketplace | App Store | Google Play | Shared asset |
|---|---|---|---|---|---|---|
| Submission channel | OpenAI developer portal | Developer portal or org admin settings (**Team/Enterprise org**) | Form at `x.ai/bot/marketplace/submit-a-plugin` | App Store Connect | Play Console | — |
| Remote MCP URL | ✅ | ✅ (Streamable HTTP) | ✅ (or GitHub repo) | ➖ | ➖ | `my.biblecli.org/mcp` |
| Auth | ✅ declare auth mode (OAuth) | ✅ **OAuth 2.1 + PKCE**, discovery RFCs, **401 contract** | ⚠️ OAuth via the Cursor catalog; custom connectors use headers | ➖ | ➖ | §5.5 (one server) |
| Domain verification | ✅ | ➖ | ➖ | ➖ | ➖ | token on `my.biblecli.org` |
| Tool annotations / hints | ✅ **with a justification per hint** | ✅ annotations on every tool | ⚠️ | ➖ | ➖ | annotation table (§5.3) |
| Privacy policy URL | ✅ **must list data accessed through ChatGPT** | ✅ | ⚠️ (Publisher Terms) | ✅ | ✅ | one policy with a section per platform |
| Terms of use URL | ✅ | ⚠️ | ⚠️ | ➖ (recommended) | ➖ (recommended) | `biblecli.org/terms` |
| Support URL / contact | ✅ | ✅ | ⚠️ | ✅ | ✅ | `biblecli.org/support` + email |
| Website | ✅ | ⚠️ | ⚠️ | ✅ (marketing URL) | ➖ | `biblecli.org/app` |
| Account deletion | ⚠️ (via privacy policy) | ⚠️ | ⚠️ | ✅ in-app | ✅ in-app **and** web URL | in-app + `biblecli.org/delete-account` |
| Demo account (**no 2FA**) with sample data | ✅ | ✅ (test account) ⚠️ | ⚠️ | ✅ | ✅ (login instructions) | **one reviewer account** + seed data |
| Test cases | ✅ **exactly 5 positive + 3 negative** | ⚠️ | ✅ confirm local + in-app testing | ➖ | ➖ | §12.4 test set |
| Demo recording | ✅ | ⚠️ | ➖ | ➖ (optional preview video) | ➖ (optional) | one 60–90 s screen recording, cut per store |
| Release notes | ✅ | ⚠️ | ➖ | ✅ "What's New" | ✅ | one changelog |
| Logo / icon | ✅ | ✅ | ✅ **square 1:1, hosted URL** | ✅ 1024² app icon | ✅ 512² icon + feature graphic | one master SVG → exports |
| Screenshots | ⚠️ | ✅ | ➖ | ✅ phone sizes | ✅ phone sizes | in-chat captures + app captures |
| Works on desktop + mobile | ✅ | ⚠️ (Claude mobile uses connectors added on the web) | ✅ (Grok Bot + Cursor if targeted) | ➖ | ➖ | test matrix in M0/M5 |
| Audience | ✅ general audiences **including teens** | ⚠️ | ⚠️ | ✅ age rating | ✅ content rating | consistent 13+ account policy |
| Terms acceptance | ✅ developer terms | ✅ directory terms ⚠️ | ✅ **xAI Publisher Terms** | ✅ Apple agreements | ✅ Play agreements | DCM signatory |
| After approval | MCP server changes go live after automatic checks; **metadata changes need a new package** | ⚠️ | ⚠️ | each update reviewed | each update reviewed | **freeze tool names, descriptions, annotations** at submission |

### 12.2 Shared assets (build once, reuse in all five)

1. **Legal pages** on `biblecli.org` (Vercel): privacy policy with **"Data accessed through ChatGPT / Claude / Grok Bot"** sections, terms of use, support page and email, account-deletion page, data-export instructions.
2. **Reviewer demo account:**
   - Password login with no 2FA, allowed only for allowlisted reviewer accounts.
   - Seed data: highlights with a color legend, visible and hidden notes, saved research from two agents, a reading plan, history, an inbox share, and a pending approval.
   - Onboarding consent already given; the Greek & Hebrew pack installed.
   - A **nightly reset** job.
3. **Test-case set** (§12.4): 5 positive + 3 negative, reused as the QA script for Claude and Grok Bot and as an automated gateway test.
4. **Tool annotation + justification table**, generated from `packages/api-schema` so the code and the submissions can't drift apart.
5. **Brand kit:** master square logo (SVG; PNG 1024/512/256), app icon set, Play feature graphic, hosted logo URL for the Grok Bot form.
6. **Screenshots and video:** app screenshots (word sheet, Journal → Research, Agents tab, Send) and in-chat captures of the same flow in ChatGPT, Claude, and Grok Bot. One 60–90 s demo recording, cut per store.
7. **Copy deck:** name, subtitle, short and long descriptions, keywords, and per-platform setup text. Platform names appear in plain text with equal prominence.
8. **Release notes / changelog.**

### 12.3 Prerequisites (start in M0; some take weeks)

| Prerequisite | Why | Lead time |
|---|---|---|
| **D-U-N-S number for DCM** | Apple and Google **organization** developer accounts | ⚠️ days to weeks |
| **Apple Developer Program (organization: DCM)** | App Store; ask for the **nonprofit fee waiver** | ⚠️ 1–3 weeks |
| **Google Play Console (organization: DCM)** | Play. An organization account avoids the closed-testing rule (12 testers for 14 days) that applies to new personal accounts ⚠️ | ⚠️ days |
| **OpenAI organization verification** + developer portal access under DCM | ChatGPT directory submission | ⚠️ days |
| **Claude Team (or Enterprise) org for DCM** | Claude directory submission requires an org | ⚠️ immediate; Team has a seat minimum and cost |
| **xAI account + Publisher Terms acceptance** | Grok Bot Marketplace form | immediate |
| **Domains:** `my.biblecli.org` (gateway), `biblecli.org` legal pages | All submissions | immediate |
| **Shared support inbox** (e.g. support@biblecli.org) | All stores | immediate |
| **Legal review** of the privacy policy, terms, and consent text | All stores + GDPR Art. 9 | 1–3 weeks |

### 12.4 Test cases (ChatGPT format; reused everywhere)

**Positive (5)**
1. "What did I highlight in John this month?" → `list_highlights` returns the demo highlights with the color legend.
2. "Look at what I just sent from Bible CLI and help me study it." → `get_inbox` + `passage`/`read` + methodology-grounded answer.
3. "Do a word study on 'abide' in John 15 and save it to my Bible CLI research." → `word_study` / `align` + `save_research` → `status: "saved"`.
4. "Make me a 30-day reading plan through Isaiah 40–55." → `save_plan` saved and visible in the app.
5. "What Greek word is behind 'love' in John 21:15–17, and how does BSB translate it elsewhere?" → `align` + `word_study` with BSB renderings.

**Negative (3)**
1. "Show me my hidden prayer notes." → hidden notes are never returned; the agent says so.
2. Read-only agent: "Save this as a note." → write tools are unavailable, with a clear message pointing to the app.
3. "Quote John 3:16 from the NIV." → not available. The agent offers BSB/WEB/KJV/ASV and does not make up text.

### 12.5 Submission order & timeline

**T = coordinated launch day.**

| When | What |
|---|---|
| **M0** | Start every prerequisite in §12.3 (D-U-N-S and Apple enrollment are the long poles). Verify each directory's current requirements against official docs and resolve the ⚠️ cells. Confirm Grok Bot Marketplace auth (OAuth via the Cursor catalog vs headers) |
| **M2** (connector live) | Implement the §5.5 auth checklist and test it with real ChatGPT developer mode, Claude custom connector, and Grok Bot custom connector (token). Draft the legal pages |
| **M3** (writes + Send) | **Freeze the tool surface** (names, descriptions, annotations). Build the reviewer demo account and seed data, record the demo, write the test cases. TestFlight + Play internal testing running |
| **M4** (hardening) | Legal review signed off; store listings drafted; security review of OAuth, tokens, and modes |
| **T − 5 weeks** | **Submit all three connector directories in parallel:** ChatGPT (heaviest: test cases, video, domain verification), Claude (via the DCM Team org), Grok Bot Marketplace (target: **Grok Bot + Cursor** proposed) |
| **T − 2 weeks** | **Submit iOS and Android** with **manual release** (App Store "manually release" / Play "managed publishing") |
| **T − 2 → T** | Answer reviewer feedback; hold approved apps. ⚠️ Whether directory listings can be held for a launch date is unknown. If one goes live early, it still works standalone (Scripture tools + `save_research`), and the app follows within days |
| **T** | Release both apps, confirm all three listings are live, update `biblecli.org` and the README, and nudge the landing docs sync |

Directory review times are unknown ⚠️. The 5-week buffer is a guess to revisit once the first submission returns.

---

## 13. Tech stack

| Layer | Choice |
|---|---|
| App | Expo SDK (React Native, TypeScript), Expo Router, `op-sqlite` or `expo-sqlite` (⚠️ confirm FTS5 full-text search), Expo push notifications, OFL Hebrew/Greek fonts |
| Native extras | Expo config plugins: Android share intents and package targeting; App Intents / share extension later |
| Backend | Cloudflare Workers: MCP gateway (OAuth 2.1 + personal access tokens, consent + mode enforcement, annotations), sync API · Durable Objects (per user) · D1 (translation requests) |
| Scripture tools | Existing `mcp.biblecli.org` on Railway (unchanged; adds annotations and a gateway header) |
| Shared code | `@divine-creative-ministries/bible-core` (from this repo) |
| Web | Vercel: `biblecli.org` app page, legal pages, donate, connector guides, account deletion |
| Email | Magic links, the support inbox, and the optional digest of translation requests |
| Data | This repo's pipeline: BSB alignment stage + mobile packs, released via `release-data.sh` |

---

## 14. MVP milestones

| Milestone | Scope | Exit criteria |
|---|---|---|
| **M0 — Spike** (~2 wks) | Device checks (share targets, prefill URLs, Grok Bot share/URL scheme); OAuth gateway prototype connected from **ChatGPT dev mode, Claude, and Grok Bot (token)**, including whether write tools work on each plan; pack sizes (translations, originals + alignment); FTS5 in the chosen SQLite library; Hebrew right-to-left rendering; **start the store prerequisites (§12.3)** | A written matrix of what actually works; every ⚠️ in this doc resolved or owned |
| **M0.5 — Shared package + alignment data** | Extract `bible-core` (publish `core-v0.1.0`; CLI uses it); **BSB alignment stage + verify gates + `align` tool** (§3.6); data release `data-v0.3.0`; create the app repo | CLI tests green; `bible align "Gen 1:1"` correct; verify gates pass |
| **M1 — Reader, Greek & Hebrew, Journal** (offline, no account) | Read (BSB built in, others on demand, parallel view, search, cross-refs), **tap-an-English-word + interlinear + word sheet**, originals pack download (onboarding on by default, Settings, first tap), **onboarding incl. consent step**, highlights and color legend, notes (eye switch), Research segment, plans, history, Request a translation, About/licenses | Usable daily as a Bible app on both platforms |
| **M2 — Accounts, sync, MCP server** | Sign-in, sync, **one gateway with OAuth 2.1 (§5.5 A) and personal access tokens (§5.5 B)**, read tools + forwarded Scripture tools with annotations, consent enforcement, per-agent pages, modes, activity log, revoke, export, delete; legal page drafts | ChatGPT, Claude, and Grok Bot each read a test user's context through `my.biblecli.org/mcp` |
| **M3 — Writes & Send** | `save_research` / `save_note` / `save_plan`; Full access (Undo 30 days, "From your agents", **100/day limit, can be turned off, overflow → approvals**, first-connect push); Approval required; shares + `get_inbox`; target picker (copy, share sheet, Android direct); **tool surface frozen**; demo account + seed + test cases | Full round trip on **all three** platforms: send → study → `save_research` → appears in Journal → Research (or waits for approval) → Undo works |
| **M4 — Launch hardening** | Privacy policy, terms, consent text with legal review; store listings + brand kit + screenshots + demo video; donations link; rate limits; security review (OAuth, tokens, modes); crash reporting | Everything in §12.1 ready to submit |
| **M5 — Connector store + app store launch** | Submissions and timeline in §12.5: three connector directories at T − 5 wks, iOS + Android at T − 2 wks with manual release, coordinated launch at T | **Listed in ChatGPT, Claude, and Grok Bot directories; live on App Store and Google Play** |

**Follow-ups, in rough priority order:**
1. KJV tap-a-word via eBible Strong's tags; Clear Bible alignments as a cross-check; WEB/ASV generated alignments labeled "approximate"
2. MCP Apps cards in Claude and ChatGPT (verse card, word sheet, research preview)
3. Per-type mode overrides; letting agents edit their own items
4. `bible login` for the CLI
5. Hosted per-user `study_*` sessions visible in the app
6. Webhook push (optional) for agents that gain inbound triggers
7. iOS App Intents, Shortcuts, and widgets
8. Licensed translations driven by request data (display only)
9. Making connector setup friendlier for church members

---

## 15. Risks

1. **Directory reviews are new and their timing is unknown** (Grok Bot Marketplace opened 2026-10-15). *Mitigation:* start prerequisites in M0, submit at T − 5 weeks, design the connector to work standalone if listed early.
2. **Auth differences between platforms** (OAuth details, callback URLs, Grok Bot headers-only connectors). *Mitigation:* one server with OAuth 2.1 + personal access tokens, tested against all three in M0 and M2.
3. **Connector setup is hard and depends on the user's plan** before listings go live (ChatGPT write limits, Claude web-first setup). *Mitigation:* guides, "Test connection", and a directory listing as the main path at launch.
4. **Unwanted agent writes under Full access.** *Mitigation:* create-only, "save only when asked" instructions, labels, Undo, the 100/day limit with overflow to approvals.
5. **Privacy and legal exposure** (Art. 9 data, defaults that favor sharing). *Mitigation:* explicit onboarding consent, per-agent grants, withdrawal, legal review, privacy policy per platform.
6. **Alignment quality at the edges:** Greek variant differences (~3%), BSB revisions. *Mitigation:* verify gates, fallback labels, tables and `bsb.txt` pinned as one snapshot.
7. **Store prerequisites under an organization** (D-U-N-S, Claude Team seat cost). *Mitigation:* start in M0; budget the Team plan.
8. **Hosting load:** the upstream server launches a process per tool call. *Mitigation:* app reading never hits the server; gateway rate limits; scale Railway when directory traffic arrives.

---

## 16. Remaining open questions

1. **Berean confirmation:** OK to email Berean to confirm the translation tables are covered by the public-domain dedication? Follow-up after launch: KJV tap-a-word?
2. **Originals pack budget:** maximum acceptable size, and Wi-Fi-only by default?
3. **Consent wording and "Not now" behavior:** legal sign-off on the onboarding consent text, and on the proposed rule that declining blocks personal-data reads but still allows Scripture tools, sends, and saves.
4. **Grok Bot Marketplace target:** Grok Bot only, or **Grok Bot + Cursor** (proposed: both; Cursor users are power users)? And does the marketplace install path use OAuth or headers?
5. **Claude Team org:** OK to open a DCM Claude Team org (seat minimum and cost) for directory submission?
6. **Audience age:** require 13+ for accounts (proposed), given the ChatGPT "teens" requirement and COPPA?
7. **Token expiry:** personal access tokens never expire (proposed, with a "last used" display), or expire after a year with a reminder?
8. **Daily limit window:** calendar day in the user's timezone (proposed) or a rolling 24 hours?
9. **Research visibility:** saved research from one agent readable by other agents by default (proposed: yes)?
10. **Names:** app repo `bible-cli-app`, package `@divine-creative-ministries/bible-core`, gateway `my.biblecli.org`, store subtitle *"Scripture for you and your AI"*?
11. **Donations:** which giving processor; Apple nonprofit program later?
12. **History detail:** chapter-level, with a 30-day default window for agents (proposed)?
13. **Translation requests:** keep the tally private (proposed)?
14. **Legal & ops:** who drafts the policy and terms; what's the UK KJV decision; who is on call; what's the monthly hosting budget?
15. **Localization and accessibility:** English-only UI at launch; VoiceOver/TalkBack and Dynamic Type as launch requirements (recommended: yes)?

---

## References (checked 2026-11-03/04; third-party unless noted)

- Berean free downloads (BSB translation tables) — https://berean.bible/downloads.htm · terms (public domain, official) — https://berean.bible/terms.htm
- Clear Bible / Biblica alignments (CC BY 4.0) — https://github.com/Clear-Bible/Alignments
- eBible KJV / WEB / ASV USFM — https://ebible.org/find/show.php?id=eng-kjv2006
- OpenAI Apps SDK auth — https://developers.openai.com/apps-sdk/build/auth · submission guidelines — https://developers.openai.com/apps-sdk/app-submission-guidelines
- Claude connector submission — https://claude.com/docs/connectors/building/submission · custom connectors — https://support.claude.com/en/articles/11503834-building-custom-connectors-via-remote-mcp-servers
- Grok Bot Marketplace submission — https://x.ai/bot/marketplace/submit-a-plugin
- ChatGPT connector compatibility (plan and write-action limits) — https://zuplo.com/learn/mcp/compatibility/clients/chatgpt-connectors.md
- CIMD vs DCR — https://workos.com/blog/mcp-client-identity-dcr-cimd-auth-md
- MCP Apps in Claude and ChatGPT — https://alpic.ai/blog/mcp-apps-goes-official-claude-chatgpt-support
