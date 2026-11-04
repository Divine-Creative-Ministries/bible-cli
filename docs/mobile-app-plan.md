# Bible CLI for iOS & Android — product spec & MVP plan

Status: **draft v2 for review** · Owner: Bailey Mullens (Divine Creative Ministries) · 2026-11-03

> **One line:** a free, offline Bible app with Greek and Hebrew one tap away.
> Your AI agents can read your highlights, notes, and reading history, and save
> research back into the app, under a permission mode you choose for each
> agent. You can send a passage to Claude, ChatGPT, Grok, or your own bot, and
> every agent stays grounded in the actual text through the existing bible-cli
> tools.

The platform behavior described here was checked on 2026-11-03, mostly against
third-party sources. Items marked ⚠️ need confirming on a device or in official
docs during Phase 0.

---

## 1. Decisions locked

| # | Topic | Decision |
|---|---|---|
| 1 | Grok | **Both:** the xAI Grok app pulls from the inbox via the connector. Bailey's **GrokBot** gets a **webhook push** and **replies in the GrokBot chat itself.** |
| 2 | Audience | **AI power users first.** General church members come later, once connector setup is smoother. |
| 3 | Translations | **Public domain at launch, with BSB as the default** (WEB, KJV, ASV also included). **Request a translation** in Settings; demand decides which licenses to pursue. |
| 4 | Business model | **Free, supported by donations.** DCM is a 501(c)(3). No features behind a paywall. |
| 5 | Agent writes | Agents can save **notes, reading plans, and research**. Each connected agent has a **permission mode** the user picks: **Full access (default)**, Approval required, or Read only. |
| 6 | Saved research | A new **`save_research`** tool lets any agent save research done with the user (title, body, passage refs). It appears in **Journal → Research** and on that agent's page. |
| 7 | Note visibility | **New notes are visible to agents by default.** The user can hide any note. **No private vault.** |
| 8 | Brand | The app is called **Bible CLI** (same brand as the CLI and MCP server). |
| 9 | Repos | The app lives in its **own new repo**. Shared Bible code (canon, refparse, …) is **published as a small npm package**. |
| 10 | Greek & Hebrew | **Tap-a-word original languages are in the MVP.** |
| 11 | Platforms | **iOS and Android launch together.** |

### Derived defaults (reversible; flag if you disagree)

- **Framework:** Expo (React Native) with TypeScript. One codebase for both stores, and it uses the shared package directly.
- **Backend:** Cloudflare Workers, with a **Durable Object per user** (each user gets their own SQLite database) and the Workers OAuth provider.
- **Agent endpoint:** one login-protected gateway, `https://my.biblecli.org/mcp`. The existing **`mcp.biblecli.org` stays public, needs no login, and keeps running unchanged on Railway.**
- **Reading never calls a server.** Bible text and the Greek/Hebrew data ship as offline packs built by this repo's pipeline.
- **Safety rule for Full access:** agents can **create** items but can **never edit or delete anything the user wrote**. Everything an agent saves is labeled with the agent's name and can be undone (§5.4).

---

## 2. Product

### Positioning vs YouVersion and Logos

| | YouVersion | Logos | **Bible CLI** |
|---|---|---|---|
| Your data readable by the AI you already use | — | — (has its own AI) | **Yes: one MCP connector** |
| Agents save their research into your Bible app | — | — | **Yes, with a per-agent permission mode** |
| Agent answers grounded in the text | n/a | closed | **Text-first methodology and verification tools** |
| Original languages | minimal | deep, paid | **Free, offline, tap any word** |
| Openness | closed | closed | **Open data, open source, export anytime** |
| Translation library | huge | huge | **Public domain at launch**; requests decide what comes next |

### Navigation: 4 tabs

1. **Read**
   - BSB by default; WEB, KJV, ASV available. Parallel view of two translations. Search sits inside Read (offline full-text search).
   - **Greek & Hebrew:** an interlinear toggle and a word sheet for any original word (§3).
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
     - **Pending approvals** (Approval required agents), each with **Approve / Edit then approve / Reject**.
     - Badge count for pending approvals.
   - **Connections:** a page for each agent with its mode, data access, activity log, and **Revoke** (§5.4).
   - **Webhook agents:** e.g. GrokBot (§5.6).
   - **Sent:** a history of every passage shared with an agent.
   - **Connect an agent:** a setup guide for each platform (§5.7).

### Settings

- Translations: download/remove packs · Greek & Hebrew pack · **Request a translation** (§4)
- Agents: "Agents can see new notes" (**on** by default) · default mode for new connections (**Full access** by default) · pause history · default history window
- Account: sign in/out · **export all data (JSON)** · **delete account** (required by both stores)
- **Support Bible CLI** (donations, §7) · About & licenses (generated from `bible licenses`)

### Works without an account

Reading, Greek/Hebrew, highlights, notes, plans, and history all work **offline with no account**. An account is needed only for sync, connecting agents, Send-to-inbox, and webhooks. When the user signs in, local data is uploaded and merged.

---

## 3. Greek & Hebrew (MVP)

### What the data supports today

- `bible-study.db` → `words` has **615,371 rows** (606,950 with `is_default = 1`), one per morpheme (TAHOT Hebrew/Aramaic, TAGNT Greek). Each row has a verse id, surface form, transliteration, lemma, Strong's number, a source-text gloss, and decoded parsing (part of speech, person, gender, number, case, tense, voice, mood, stem).
- Lexicons are in the same database: abridged BDB (Hebrew), extended Abbott-Smith/TBESG and Dodson (Greek).
- **There is no alignment between original words and English words** in BSB, WEB, KJV, or ASV. Tapping an English word can't yet open its Greek or Hebrew word. The MVP therefore reaches the originals **by verse**, and tapping individual English words is listed as a follow-up (open question 1).

### MVP interaction

1. **Interlinear toggle** in the Read menu: each verse shows the original-language line under the English, with word-by-word glosses. This works like `bible interlinear`.
2. **Verse → Original:** long-press a verse and tap *Original* to open the interlinear for that verse in a bottom sheet.
3. **Tap any original word** (in either view) to open the **word sheet**:
   - Surface form, transliteration, lemma, Strong's number.
   - **Parsing in plain English** (e.g. "verb · aorist · active · indicative · 3rd person singular").
   - Gloss, plus the lexicon entry (BDB / Abbott-Smith / Dodson).
   - Occurrence count, a book distribution chart, and **All occurrences** (offline lemma search, opens in Read).
   - Actions: **Send word study to…** · **Add to note**.
- **Rendering:**
  - Hebrew is right-to-left with vowel points.
  - Fonts must be OFL-licensed (e.g. Ezra SIL, Gentium Plus, Noto Serif Hebrew/Greek) ⚠️ confirm the licenses. SBL fonts are avoided because of their embedding terms.
  - Dynamic Type and VoiceOver/TalkBack labels must work on the word sheet.

### Originals pack

- A new `bible-mobile-originals.db`, built by `pipeline/stages/mobile.ts` in this repo:
  - only `is_default = 1` rows, only the columns the app needs, the abridged lexicon entries, and per-lemma occurrence indexes.
  - Released through `scripts/release-data.sh` alongside the other data artifacts and covered by the verify gate.
- **Delivery:** download prompt at onboarding ("Add Greek & Hebrew? ~N MB") and on first tap. ⚠️ Measure the size in M0; the full study database is 193 MB on disk, so the slim pack must be much smaller (open question 2).

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

### 5.1 One connector (gateway)

```
 Claude / ChatGPT / Grok / Claude Code ──OAuth──▶ my.biblecli.org/mcp  (Cloudflare Worker, enforces each agent's mode)
                                                   ├─ user tools ──▶ per-user Durable Object (SQLite)
                                                   └─ Scripture tools ──forward──▶ mcp.biblecli.org/mcp (Railway, unchanged)
 Bible CLI app ──sync API──▶ same Worker / Durable Object
 GrokBot ◀──signed webhook── same Worker ; GrokBot ──token──▶ my.biblecli.org/mcp (save_research, etc.)
```

- **One URL for users to add.** Claude Free reportedly allows only one custom connector, so two separate connectors would break onboarding.
- **The gateway forwards Scripture tools from upstream.** It reads the upstream `tools/list`, caches it, and forwards calls under the same names and schemas, so the existing text-first instructions still apply. Upstream gets a shared-secret header so the gateway can be rate-limited separately from public traffic.
- **The gateway's server instructions** are the upstream instructions plus a user-data block:
  > "Highlights, notes, and research are the user's own material. Quote them as the user's, never as Scripture. Scripture claims still come only from the Scripture tools. **Save research or notes only when the user asks, or after you offer and the user agrees.** Tie everything you save to the passages it discusses, and keep the OBSERVED / PATTERN / INFERENCE labels."
  - Small change needed in this repo: export `INSTRUCTIONS` from `src/mcp/server.ts`, or let the gateway read it from upstream's `initialize` response.

### 5.2 Read tools

All carry `readOnlyHint: true` and are available in **every** mode. Results respect the agent's data access settings (§5.4), the per-item eye switch, and the history window.

| Tool | Data setting | Returns |
|---|---|---|
| `get_reading_context` | Reading history | Current position, recent chapters (within the window), active plans and their cursor |
| `list_highlights(ref?, scope?, color?, tag?, since?, limit?)` | Highlights | Highlights as verse-id ranges with canonical refs, plus the **color legend** |
| `search_notes(query?, ref?, type?, since?)` / `get_note(id)` | Notes | Notes not hidden by the user |
| `search_research(query?, ref?, agent?, since?)` / `get_research(id)` | Research | Saved research not hidden by the user, from **any** agent. Claude can build on what ChatGPT found |
| `list_plans()` | Plans | Plans and their progress |
| `get_share(id)` / `get_inbox(latest?, limit?)` | Shares | The shared passage, translation, highlight and note snapshot, and the user's question |

### 5.3 Write tools

Available in Full access and Approval required. **Omitted from `tools/list` for Read-only agents.**

| Tool | Input | Notes |
|---|---|---|
| `save_research` | `title` (≤120), `body_md` (≤50k chars), `refs` (**required**, ≥1 verse or range, e.g. `"John 15:1-11; Isa 5:1-7"`), `summary?` (≤280), `tags?`, `method?` (queries/tool calls the agent used), `conversation_url?`, `related?` (ids of notes or research) | The main write-back. Shown in Journal → Research |
| `save_note` | `text`, `type`, `refs` (**required for agents**), `title?` | Must be tied to verses, the same rule as the study notebook |
| `save_plan` | `name`, `scope`, `unit`, `pace`, `start?` | Scope is parsed with the shared refparse |

- **Responses:** `{ status: "saved" | "pending_approval", id, kind, app_url }`. The agent tells the user accurately whether the item was saved or is waiting for approval in the app.
- **Validation:** the server parses `refs` with `bible-core` and rejects anything it can't parse, with a helpful error. Sizes are capped, and Markdown is stored as text and rendered safely (no HTML or scripts).
- **Create-only in the MVP:** no `update_*` or `delete_*` tools. Agents can't change user content (follow-up: agents editing their own items).
- **MCP prompts:** `study_shared_passage`, `reflect_on_recent_reading`, `save_this_study`. Claude shows these as slash commands.

### 5.4 Per-agent permission modes

Like T3 Code, every connected agent gets a mode, chosen in the app and **enforced on the server** by the gateway on every call.

| Mode | Read tools | Write tools | Where writes land |
|---|---|---|---|
| **Full access** *(default)* | ✅ (within data access) | ✅ | Saved immediately, labeled with the agent, shown in **From your agents** with **Undo** |
| **Approval required** | ✅ | ✅ | **Pending approvals**: saved only when the user taps Approve (or edits, then approves) |
| **Read only** | ✅ | hidden | — |

**Per-agent settings page** (Agents → *Claude*):

```
Claude                                      Connected Nov 3 · last used 9:14
────────────────────────────────────────────────────────────────────────────
Mode            ● Full access   ○ Approval required   ○ Read only
Can read        [✓] Reading history   window: [30 days ▾]
                [✓] Highlights   [✓] Notes (not hidden)   [✓] Research
                [✓] Plans        [✓] Things you send
Notifications   [✓] When Claude saves or suggests something
Daily limit     30 saves/day — after that, saves need approval
Activity        Today: read 3 notes · saved "Abide in John 15" (research)  ›
                Rename · Revoke access
```

**Defaults for a new connection:**

| Setting | Default |
|---|---|
| Mode | **Full access** (changeable in Settings → Agents → *Default mode for new connections*) |
| Reading history | on, **30-day** window |
| Highlights / Notes / Research / Plans / Shares | on |
| Notifications | on |
| Daily save limit | 30 per agent (open question 4) |

**Rules:**
- **Every mode:** agents can't read hidden items and can't edit or delete user-authored content. Revoking takes effect on the next call.
- **Full access safety net:**
  - Everything saved is labeled with the agent and appears in **From your agents**.
  - Each saved item has **Undo** (soft delete, restorable for 30 days), and there's an **Undo all from this agent today** action.
  - The **daily limit** switches excess writes to approval instead of failing them.
  - The first connection triggers a push: *"Claude is connected with Full access. Change?"* It deep-links to the agent's page.
- **Changing modes:** the change applies on the next tool call. Clients can cache tool lists, so a write call from an agent that is now Read only gets a clear error: *"Bible CLI: this agent is read-only. The user can change this under Agents."*
- **Scope of the model:** modes apply to OAuth connectors, **personal access tokens** (mode chosen when the token is created), and **webhook agents** (GrokBot).
- **OAuth scopes stay coarse.** Clients request one scope, and the real policy is stored on the server per grant, so the user can change a mode or data access without reconnecting.
- **Follow-up:** advanced per-type overrides (e.g. "research: full access, notes and plans: approval required").

### 5.5 Login & consent

- **OAuth 2.1 with protected-resource metadata.** Support **CIMD** (Client ID Metadata Documents), which the spec reportedly now prefers, **and DCR** (Dynamic Client Registration), which older clients use and ChatGPT's app directory reportedly still requires.
- **Allowlisted callbacks:**
  - `https://claude.ai/api/mcp/auth_callback`
  - ChatGPT's `chatgpt.com` connector callback ⚠️
  - Grok's callback ⚠️ (capture in Phase 0)
- **Sign-in on the consent page:** Sign in with Apple, Google, or an email magic link (Sign in with Apple is included because Google sign-in is offered). Option: "Approve on your phone" via a push to the app.
- **The consent screen states plainly what this agent will get:**
  > "Claude will be able to read your reading history (last 30 days), highlights, plans, research, and **all notes you haven't hidden**, and to **save notes, plans, and research directly** (Full access)."
  - **Allow** / **Customize**. Customize shows the mode picker and the data toggles.
  - ⚠️ Visible-by-default notes plus Full access by default means the **affirmative Allow on a fully itemized screen** is the explicit consent. Confirm with counsel that this satisfies GDPR Art. 9 (pre-ticked boxes don't count as consent; open question 3).
- **Grants:** each grant stores the mode, data access, history window, daily limit, last used, and revoked_at. Access tokens are short-lived, refresh tokens rotate, and tokens are stored only as hashes.
- **Personal access tokens:** generated in the Agents tab with a mode and data access. Used by Claude Code, Codex, scripts, and GrokBot, sent as a `Bearer` header.

### 5.6 Webhook agents (GrokBot)

- **Setup:** Agents → *Add webhook agent* → name, HTTPS URL, mode, data access. A **signing secret is shown once.** A paired **access token** is created for calling back into the gateway.
- **Flow:**
  1. The user taps **Send to → GrokBot**.
  2. The Worker POSTs a `share.created` event (below).
  3. GrokBot verifies the signature, studies the passage with the Scripture tools through the gateway, and **replies in the GrokBot chat**.
  4. If the user asks, GrokBot calls `save_research` (subject to its mode), and the research appears in Journal → Research.

```json
{ "type": "share.created", "id": "evt_…", "created_at": "…",
  "share": { "id": "shr_…", "ref": "John 15:1-11", "verse_start": 43015001, "verse_end": 43015011,
             "translation": "BSB", "text": "…", "highlight": {"color": "promise", "verses": "John 15:5"},
             "note": null, "question": "What does 'abide' mean here?" },
  "mcp_url": "https://my.biblecli.org/mcp" }
```

- **Headers:** `X-BibleCLI-Signature: t=<ts>,v1=<HMAC-SHA256(secret, ts.body)>`. Retries use exponential backoff for 24 hours. Delivery status appears in Sent.
- **GrokBot-side work (Bailey's bot):** a webhook receiver, signature check, a GrokBot conversation tied to the user, MCP client config with the token. Needed tools: the Scripture tools, `get_share`, `save_research`.

### 5.7 Connecting each platform (onboarding for power users)

| Platform | How | Notes |
|---|---|---|
| **Claude** (web, desktop, mobile) | Settings → Connectors → Add custom connector → `my.biblecli.org/mcp` | Must be **added on the web first**; mobile then uses it. Free plan reportedly allows 1 custom connector |
| **ChatGPT** | Settings → Apps/Connectors → Developer mode → add server | ⚠️ Gated by plan; **write actions are reportedly limited on some plans**, so `save_*` may be unavailable even with Full access. Read tools still work |
| **Grok app** | grok.com → Connectors → New → Custom → URL | ⚠️ Reportedly paid plans only; no official xAI doc found yet |
| **Claude Code / Codex / CLI** | `claude mcp add --transport http bible-cli https://my.biblecli.org/mcp`, or a personal access token | Follow-up: `bible login` so the local stdio server can include user tools |
| **GrokBot** | Webhook agent (§5.6) | Push in, replies in GrokBot chat |

Each guide in the app shows: a copy-URL button, a short screen recording, and a **"Test connection"** step. When the connector first calls the gateway, the app shows "Connected ✓ — Full access · Change".

---

## 6. Send to…

**Rule:** consumer chat apps can't receive pushed messages. Sending means **handing off text** and/or **dropping the passage in the inbox**. Every send creates a **share** first, so the agent can always fetch the full context.

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
| **Prompt-prefill URLs** (`chatgpt.com/?q=`, `grok.com/?q=`, `claude.ai/new?q=`) | ⚠️ | ⚠️ | **Only behind a remote flag.** Undocumented; Claude's reportedly broke in Oct 2025 |
| **Inbox via connector** (`get_inbox`) | ✅ | ✅ | **Yes** (core) |
| **Webhook push** (GrokBot) | ✅ | ✅ | **Yes** |
| **App Intents / Shortcuts** | later | — | Follow-up |

- **Target picker:** Claude · ChatGPT · Grok · GrokBot · Other (share sheet) · Copy. The user can choose a default, and the last target used is remembered.
- **Word studies** sent from the word sheet use the same mechanism, with the lemma and Strong's number in the share.
- **Trademarks:** platform names appear in plain text only, with no third-party logos and nothing implying endorsement.

---

## 7. Donations (DCM 501(c)(3))

- Settings → **Support Bible CLI**, plus a quiet, dismissible prompt at most once per quarter. No features are gated, ever.
- **Launch path: link out** to `biblecli.org/donate` (hosted giving page). ⚠️ Confirm the current wording of App Store guideline 3.2.1(vi) and 3.2.2 for nonprofits and link-outs, and Google Play's Payments policy exemption for donations.
- **Later option:** Apple's approved-nonprofit route allows **in-app donations via Apple Pay**. It requires enrolling in Apple's nonprofit program.

---

## 8. Data, licensing, offline, sync

- **Mobile packs**, built in this repo. Add a new `pipeline/stages/mobile.ts`; packs go through `scripts/release-data.sh` with the same manifest, checksums, and verify gate. The app pins a `DATA_VERSION` the same way the CLI does.
  - `bible-mobile-<TR>.db` per translation: `verse_texts` plus full-text search. **BSB is bundled; the others download on demand.** ⚠️ Measure sizes; the full core database is about 93 MB, so it isn't an option.
  - `bible-mobile-xref.db`: cross-references.
  - `bible-mobile-originals.db`: Greek & Hebrew (§3), **in the MVP**.
- **Verse ids:** highlights, notes, research, shares, and plans store `BBCCCVVV` verse-id ranges, not translation offsets, so they work in any translation.
- **Licensing:**
  - BSB, WEB, KJV, ASV: public domain.
  - TAHOT, TAGNT, and the lexicons: CC BY (BDB itself is public domain). The About screen shows the attribution.
  - **"World English Bible"** is a trademark: the text must not be modified under that name.
  - ⚠️ **KJV in the UK** (Crown letters patent): decide on the UK storefront.
  - **LXX (CC BY-SA) is not in the app.**
  - Any future licensed translation is **displayed only**. Agents and shares always carry public-domain text.

### Sync

- Every record has a ULID, `updated_at`, and a soft-delete marker. Conflicts are resolved last-write-wins per record.
- `POST /sync { cursor, ops[] } → { ops[], cursor }` against the user's Durable Object. Items saved by agents arrive through the same sync stream.
- The app works fully offline and syncs when the app comes to the foreground, after edits (with a debounce), and on a silent push when an agent saves something.

### Core records (per-user Durable Object)

| Record | Key fields |
|---|---|
| `highlight` | id, verse_start, verse_end, color_key, tags[], timestamps |
| `color_legend` | key, label, hex |
| `note` | id, title?, body_md, type, anchors[], **agent_visible (default true)**, source, timestamps |
| `research` | id, title, summary?, body_md, anchors[] (≥1), tags[], method?, conversation_url?, related[], **agent_visible (default true)**, source, timestamps |
| `reading_event` | book, chapter, translation, read_at |
| `plan` | id, name, scope, unit, units[], pace, start_date, cursor, source |
| `share` | id (≥10 random characters), range, translation, text, highlight/note snapshot, question, target, delivered_at |
| `pending_item` | id, kind (note \| plan \| research), payload, grant_id, status (pending \| approved \| edited \| rejected \| expired), timestamps |
| `grant` | client_id, client_name, kind (oauth \| token \| webhook), **mode**, data_access{…}, history_window, daily_limit, notify, webhook_url?, secrets stored hashed, last_used, revoked_at |
| `activity` | grant_id, tool, item ids or counts, ts (**content is never logged**) |

`source` is `user` or `{ grant_id, client_name }`. It drives the "Saved by…" label and Undo.

---

## 9. Repos & the shared package

| Repo | Contents |
|---|---|
| **`bible-cli`** (this repo) | CLI, public MCP server, data pipeline (**including mobile packs**), data releases, and the shared package as an npm workspace at `packages/bible-core` |
| **New app repo** (name TBD, e.g. `bible-cli-app`) | `apps/mobile` (Expo) · `apps/gateway` (Cloudflare Worker: MCP gateway, OAuth, sync, webhooks) · `packages/api-schema` (sync records + MCP tool schemas shared by app and gateway) |

**`@divine-creative-ministries/bible-core`**
- **Contents:**
  - `canon` (books, verse-id helpers), `refparse` (forgiving reference parser), reference formatting, scope parsing.
  - The **plan-unit builder**: the pure parts of `commands/reading.ts` `chunkChapters` and `study/session.ts`, which today import the database or `fs`.
  - Morph-code → plain-English parsing labels, if they can be made pure.
- **Constraints:** zero runtime dependencies, ESM, no Node APIs, so it runs in React Native, Workers, and Node.
- **Releases:** its own version and tag (e.g. `core-v0.1.0`), published with the same npm Trusted Publishing (OIDC) workflow. The CLI pins an exact version.
- **Follow-up:** update CLAUDE.md release rules once this exists.

---

## 10. Privacy & trust

- **What's visible by default:** notes and research are visible to agents unless hidden. **Each agent still only reads what its grant allows.** The consent screen says so plainly, and the eye switch is one tap on every card.
- **Agents with Full access only add, never change.** Every item is labeled with its agent and can be undone. The daily limit routes surplus writes to approval. Hidden items are never readable in any mode.
- **Prompt injection:** text in notes or shares could try to steer an agent into saving junk. *Mitigations:* create-only, provenance labels, Undo, the daily limit, and a one-tap switch to Approval required.
- **Activity log:** e.g. "ChatGPT read 3 notes · saved 1 research · Tue 9:14". Visible in the app and exportable.
- **Consent copy at connection time:** once data reaches ChatGPT, Claude, or Grok, *that platform's* retention and training policies apply.
- **Regulatory:**
  - Faith notes count as **religious-belief data, a special category under GDPR Art. 9**, so explicit consent is required.
  - Apple's guideline 5.1.2 requires disclosure and permission before personal data is shared with third-party AI.
  - The itemized consent screen (§5.5) is designed for both. Store this consent per grant.
  - ⚠️ Legal review needed given the defaults (visible by default, Full access by default).
- **No analytics on content** (no verse text, note text, or which passages were read). Crash reporting is limited to stack traces only.
- **Data export** (JSON) and **account deletion** (in-app on iOS; web URL for Google Play).

---

## 11. App Store & Google Play

- **Name:** "Bible CLI" ⚠️ check availability on both stores. Suggested subtitle: *"Scripture for you and your AI"*.
- **Avoiding rejection for minimum functionality (4.2) or duplicate apps (4.3):** an offline reader, **Greek & Hebrew word study**, a journal, plans, and the agent integration are substantive. Lead the screenshots with the word sheet, the Agents tab, and Send.
- **Required:** Sign in with Apple (since Google sign-in is offered) · in-app account deletion · privacy label including **Sensitive Info (religious beliefs)** · Google Play Data safety form · a privacy policy URL.
- **Rights to the text:** have the public-domain and CC documentation ready for review.
- **Trademarks:** Claude, ChatGPT, and Grok are named in plain text only, with no logos in the app or store screenshots.
- **Demo account** for reviewers, with a pre-connected agent, saved research, and a pending approval, so reviewers can see the agent flows without a paid AI plan.

---

## 12. Tech stack

| Layer | Choice |
|---|---|
| App | Expo SDK (React Native, TypeScript), Expo Router, `op-sqlite` or `expo-sqlite` (⚠️ confirm FTS5 full-text search), Expo push notifications, OFL Hebrew/Greek fonts |
| Native extras | Expo config plugins: Android share intents and package targeting; App Intents / share extension later |
| Backend | Cloudflare Workers: gateway MCP with mode enforcement, OAuth (workers-oauth-provider), sync API, webhooks · Durable Objects (per user) · D1 (translation requests) |
| Scripture tools | Existing `mcp.biblecli.org` on Railway (unchanged; adds a header for gateway traffic) |
| Shared code | `@divine-creative-ministries/bible-core` (from this repo) |
| Web | Vercel/landing: `biblecli.org/donate`, connector guides, privacy policy |
| Email | Magic links and the optional digest of translation requests |
| Data | This repo's pipeline: mobile packs released via `release-data.sh` |

---

## 13. MVP milestones

| Milestone | Scope | Exit criteria |
|---|---|---|
| **M0 — Spike** (~2 wks) | Verify on real iOS and Android devices: which apps accept shared text; whether prefill URLs open the native app; OAuth gateway prototype connected from **Claude web, ChatGPT dev mode, and Grok** (including whether write tools work on each plan); pack sizes (translations and **originals**); FTS5 in the chosen SQLite library; Hebrew right-to-left and font rendering | A written matrix of what actually works; every ⚠️ in this doc resolved |
| **M0.5 — Shared package** | Extract `bible-core` in this repo, publish `core-v0.1.0`, CLI switched to it; create the app repo | CLI tests green on the package; app imports it |
| **M1 — Reader, Greek & Hebrew, Journal** (offline, no account) | Read (4 translations, parallel view, search, cross-refs), **interlinear toggle and word sheet with the originals pack**, highlights and color legend, notes (eye switch, visible by default), Research segment (user-created only at this stage), plans, history and pause, Request a translation, About/licenses | Usable daily as a Bible app on both platforms, including Greek & Hebrew word study |
| **M2 — Accounts, sync, connector** | Sign-in, sync, gateway with read tools (including research) and forwarded Scripture tools, connect guides, consent screen, per-agent pages, **modes stored and enforced**, activity log, revoke, export, delete | Claude, ChatGPT, and Grok can each read a test user's context through one URL; Read-only mode hides write tools |
| **M3 — Writes, Send, GrokBot** | `save_research` / `save_note` / `save_plan`; **Full access** (Undo, "From your agents" feed, daily limit, first-connect push) and **Approval required** (approve/edit/reject); shares, `get_share` / `get_inbox`, target picker (copy, share sheet, Android direct); webhook agents and the GrokBot round trip | Full round trip: highlight → Send → agent studies it → `save_research` → it appears in Journal → Research labeled with the agent (Full access), or waits for approval (Approval required) → Undo works |
| **M4 — Launch hardening** | Privacy policy, consent copy and legal review, store listings and reviewer demo account, donations link, rate limits, security review of OAuth, modes, and webhooks, crash reporting | Approved on both stores |

**Follow-ups, in rough priority order:**
1. Tapping English words to open the original word (needs alignment data; open question 1)
2. MCP Apps cards in Claude and ChatGPT (verse card, word sheet, research preview)
3. Per-type mode overrides; letting agents edit their own items
4. `bible login` for the CLI
5. Hosted per-user `study_*` sessions visible in the app
6. iOS App Intents, Shortcuts, and widgets
7. Licensed translations driven by request data (display only)
8. Making connector setup friendlier for church members (directory listings)

---

## 14. Risks

1. **Connector setup is hard and depends on the user's plan:** Claude must be set up on the web first; ChatGPT is gated by plan and **write actions may be blocked even in Full access**; Grok needs a paid plan. *Mitigation:* the audience is power users first, with excellent guides and a "Test connection" step that reports which tools work.
2. **Unwanted agent writes under Full access** (overeager agents, prompt injection). *Mitigation:* create-only, server instructions to "save only when asked", provenance labels, Undo plus bulk Undo, the daily limit, and a one-tap switch to Approval required.
3. **Privacy and legal exposure** from visible-by-default notes plus Full access, given Art. 9 data. *Mitigation:* itemized affirmative consent, the eye switch on every card, legal review in M4.
4. **Greek & Hebrew scope in the MVP:** pack size, right-to-left rendering, and users expecting to tap English words. *Mitigation:* measure in M0, reach the originals by verse first, explain clearly in the UI ("Tap a verse's Original to see the Greek").
5. **Undocumented hand-off paths** (prefill URLs, share targets). *Mitigation:* the share text stands on its own, prefill URLs sit behind a remote flag, and copy always works.
6. **Expectations about translations.** *Mitigation:* BSB is a strong modern default, and Request a translation turns the gap into a roadmap.
7. **Trust and security:** the OAuth server, mode enforcement, and webhooks. *Mitigation:* per-user Durable Object isolation, hashed tokens, modes checked on the server on every call, no content in logs, a security review in M4.
8. **Hosting load:** the upstream server launches a process per tool call. *Mitigation:* app reading never hits the server; the gateway rate-limits; scale Railway only if agent traffic grows.

---

## 15. Remaining open questions

1. **Tapping English words:** is it OK that the MVP reaches Greek/Hebrew by verse (interlinear and word sheet), not by tapping an English word? If English tapping matters soon, the candidate source is BSB's published interlinear/alignment tables. ⚠️ Their license and format need checking, and a pipeline stage would be needed.
2. **Originals pack delivery and size budget:** bundled in the app or downloaded at onboarding? What's the maximum acceptable size?
3. **Consent with these defaults:** is an itemized screen with a single affirmative **Allow** (Full access plus all data on) acceptable to counsel under GDPR Art. 9, or must EU users toggle each permission themselves?
4. **Full access limits:** daily save limit per agent (proposed 30), Undo window (proposed 30 days), and whether research counts toward the limit.
5. **Research visibility:** should saved research from one agent be readable by other agents by default (proposed: yes, it's "visible by default" like notes)?
6. **Repo and package names:** `bible-cli-app` for the new repo? `@divine-creative-ministries/bible-core` for the package? Should the package live as a workspace in this repo (proposed) or in its own repo?
7. **Gateway domain:** `my.biblecli.org/mcp`, or something else?
8. **GrokBot:** does it already have a way to receive webhooks and an MCP client, or is that new work? Which chat surface does "the GrokBot chat" mean (Telegram, X, its own app)? That affects how a share becomes a conversation.
9. **Store subtitle and naming:** is *"Scripture for you and your AI"* OK? Does the "CLI" wording need explaining for the later church audience?
10. **Donations:** which giving processor or page should `biblecli.org/donate` use? Should DCM enroll in Apple's nonprofit program later?
11. **History:** chapter-level only (proposed), and a 30-day default window for agents (proposed)?
12. **Translation requests:** keep the tally private (proposed), or show a public "most requested" list?
13. **Legal:** who drafts the privacy policy and consent copy? What is the UK KJV decision?
14. **Ops:** who is on call for the gateway, and what is the monthly hosting budget ceiling?
15. **Localization and accessibility:** English-only UI at launch? Confirm VoiceOver/TalkBack and Dynamic Type as launch requirements (recommended: yes).

---

## References (checked 2026-11-03)

- OpenAI Apps SDK auth — https://developers.openai.com/apps-sdk/build/auth
- ChatGPT connector compatibility (plan and write-action limits) — https://zuplo.com/learn/mcp/compatibility/clients/chatgpt-connectors.md
- Anthropic: custom connectors via remote MCP — https://support.claude.com/en/articles/11503834-building-custom-connectors-via-remote-mcp-servers
- Claude connectors overview (plans) — https://sunpeak.ai/blogs/what-are-claude-connectors/
- Grok connectors (third-party reports) — https://beginnersinai.org/grok-connectors-launch-2026/ · https://www.context-link.ai/blog/grok-custom-connector
- CIMD vs DCR — https://workos.com/blog/mcp-client-identity-dcr-cimd-auth-md · https://www.scalekit.com/blog/mcp-authorization-guide
- MCP Apps in Claude and ChatGPT — https://alpic.ai/blog/mcp-apps-goes-official-claude-chatgpt-support
- Prefill URL behavior (unofficial) — https://holdenhewett.github.io/starlight-llm-actions/getting-started/concepts/
