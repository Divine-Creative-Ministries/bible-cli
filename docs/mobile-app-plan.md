# Bible CLI for iOS & Android — product spec & MVP plan

Status: **draft for review** · Owner: Bailey Mullens (Divine Creative Ministries) · 2026-11-03

> **One line:** a free, offline Bible app whose highlights, notes, and reading
> history your AI agents can read (with your permission), and that lets you send
> a passage to Claude, ChatGPT, Grok, or your own bot. Every agent stays
> grounded in the actual text through the existing bible-cli tools.

The platform behavior described here was checked on 2026-11-03, mostly against
third-party sources. Items marked ⚠️ need confirming on a device or in official
docs during Phase 0.

---

## 1. Decisions locked

| # | Topic | Decision |
|---|---|---|
| 1 | Grok | **Both:** the xAI Grok app pulls from the inbox via the connector; Bailey's **GrokBot** gets a true **webhook push**. |
| 2 | Audience | **AI power users first.** General church members come later, once connector setup is smoother. |
| 3 | Translations | **Public domain at launch, with BSB as the default** (WEB, KJV, ASV also included). New: **Request a translation** in Settings; demand decides which licenses to pursue. |
| 4 | Business model | **Free, supported by donations.** DCM is a 501(c)(3). No features behind a paywall. |
| 5 | Agent writes | **Agents can suggest notes and reading plans.** Nothing is saved until the user approves it in the app. |
| 6 | Brand | The app is called **Bible CLI** (same brand as the CLI and MCP server). |
| 7 | Privacy | **No vault.** Each note has its own **"Agents can see this"** switch. |
| 8 | Platforms | **iOS and Android launch together.** |

### Derived defaults (reversible; flag if you disagree)

- **Framework:** Expo (React Native) with TypeScript. It shares `canon.ts` and `refparse/` with the CLI, and one codebase covers both stores.
- **Backend:** Cloudflare Workers, with a **Durable Object per user** (each user gets their own SQLite database) and the Workers OAuth provider.
- **Agent endpoint:** one login-protected gateway, `https://my.biblecli.org/mcp`. The existing **`mcp.biblecli.org` stays public, needs no login, and keeps running unchanged on Railway.**
- **Reading never calls a server.** Bible text ships in offline packs built by this repo's pipeline.

---

## 2. Product

### Positioning vs YouVersion and Logos

| | YouVersion | Logos | **Bible CLI** |
|---|---|---|---|
| Your data readable by the AI you already use | — | — (has its own AI) | **Yes: one MCP connector** |
| Agent answers grounded in the text | n/a | closed | **Text-first methodology and verification tools** |
| Original languages | minimal | deep, paid | **Free** (fast-follow in the app; available to agents on day one) |
| Openness | closed | closed | **Open data, open source, export anytime** |
| Translation library | huge | huge | **Public domain at launch**; requests decide what comes next |

### Navigation: 4 tabs

1. **Read**
   - BSB by default; WEB, KJV, ASV available. Parallel view of two translations. Search sits inside Read (offline full-text search).
   - Long-press verse(s) to open the action bar: **Highlight · Note · Send to… · Copy with context · Compare**.
   - Cross-reference markers (OpenBible.info data, already in the core database).
   - Reading history is recorded automatically at chapter level. A visible **Pause history** toggle lives in the Read menu and in Settings.
2. **Journal** (segments: Highlights | Notes)
   - **Highlights:** filter by color, tag, or book. The user names their colors (a **color legend**, e.g. yellow = "promise", red = "command"), and agents receive that legend.
   - **Notes:** Markdown, optionally tied to one or more verse ranges. Types: `journal` (default), `observation`, `question`, `prayer`, `conclusion`.
   - **Every note has an "Agents can see this" switch**, shown as an eye icon on the note card. New notes default to **off** (see open question 1).
   - An approved agent suggestion keeps a **"Suggested by Claude"** label showing where it came from.
3. **Plans** (Plans | History)
   - **Plans:** a scope (e.g. "Isaiah 40–55"), a unit (chapter or chunk), a pace (units per day), and a start date. This reuses the study-session model from `src/study/session.ts`, where units are stored with the plan so the cursor stays stable.
   - **History:** a timeline of chapters read, with no pressure from streaks. Each entry can be deleted, and the whole history can be cleared.
4. **Agents** (what makes the app AI-native)
   - **Suggestions inbox** (badge count): notes and plans suggested by agents. Each can be **Approve / Edit then approve / Reject**.
   - **Connections:** each connected agent with its permissions, history window, last access, an activity log, and **Revoke**.
   - **Webhook agents:** e.g. GrokBot (see §4.4).
   - **Sent:** a history of every passage shared with an agent.
   - **Connect an agent:** a setup guide for each platform (see §4.5).

### Settings

- Translations: download/remove packs · **Request a translation** (§3)
- Agents: global default for new notes ("Agents can see new notes": off/on) · pause history · history window shown to agents by default
- Account: sign in/out · **export all data (JSON)** · **delete account** (required by both stores)
- **Support Bible CLI** (donations, §6) · About & licenses (generated from `bible licenses`)

### Works without an account

Reading, highlights, notes, plans, and history all work **offline with no account**. An account is needed only for sync, connecting agents, Send-to-inbox, and webhooks. When the user signs in, local data is uploaded and merged.

---

## 3. Request a translation (new)

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
- **Licensing reminder:** a licensed translation added later is **displayed only**. Agents always receive public-domain text (§7).

---

## 4. Agent integration

### 4.1 One connector (gateway)

```
 Claude / ChatGPT / Grok / Claude Code ──OAuth──▶ my.biblecli.org/mcp  (Cloudflare Worker)
                                                   ├─ user tools ──▶ per-user Durable Object (SQLite)
                                                   └─ Scripture tools ──forward──▶ mcp.biblecli.org/mcp (Railway, unchanged)
 Bible CLI app ──sync API──▶ same Worker / Durable Object
 GrokBot ◀──signed webhook── same Worker
```

- **One URL for users to add.** Claude Free reportedly allows only one custom connector, so two separate connectors would break onboarding.
- **The gateway forwards Scripture tools from upstream.** It reads the upstream `tools/list`, caches it, and forwards calls under the same names and schemas, so the existing server instructions still apply. Upstream gets a shared-secret header so the gateway can be rate-limited separately from public traffic.
- **The gateway's server instructions** are the upstream text-first instructions plus a user-data block:
  > "Highlights and notes are the user's own reflections. Quote them as the user's, never as Scripture. Scripture claims still come only from the Scripture tools."
  - Small change needed in this repo: export `INSTRUCTIONS`, or let the gateway read it from upstream's `initialize` response.

### 4.2 User tools

All read tools carry `readOnlyHint: true`. Every result respects the agent's permissions, the note-level "Agents can see this" switch, and the history window.

| Tool | Permission | Returns |
|---|---|---|
| `get_reading_context` | `history:read` | Current position, recent chapters (within the window), active plans and their cursor |
| `list_highlights(ref?, scope?, color?, tag?, since?, limit?)` | `highlights:read` | Highlights as verse-id ranges with canonical refs, plus the **color legend** |
| `search_notes(query?, ref?, type?, since?)` | `notes:read` | Only notes marked visible to agents (snippets) |
| `get_note(id)` | `notes:read` | Full note (only if visible to agents) |
| `get_share(id)` | `shares:read` | The shared passage, translation, highlight and note snapshot, and the user's question |
| `get_inbox(latest?, limit?)` | `shares:read` | Recent shares, so the user can just say "look at what I sent" |
| `propose_note(text, type, refs?, title?)` | `suggest:write` | Creates a **pending suggestion**. Notes from agents must be tied to verses (the same rule as the study notebook) |
| `propose_plan(name, scope, unit, pace, start?)` | `suggest:write` | Creates a **pending suggestion** for a plan |
| `list_plans()` | `plans:read` | Plans and their progress |

- **MCP prompts:** `study_shared_passage` and `reflect_on_recent_reading`. Claude shows these as slash commands.
- **Not in the MVP:** resources (support varies by client), MCP Apps UI cards (fast-follow), and hosted per-user `study_*` sessions (fast-follow).

### 4.3 Login and permissions

- **OAuth 2.1 with protected-resource metadata.** Support **CIMD** (Client ID Metadata Documents), which the spec reportedly now prefers, **and DCR** (Dynamic Client Registration), which older clients use and ChatGPT's app directory reportedly still requires.
- **Allowlisted callbacks:**
  - `https://claude.ai/api/mcp/auth_callback`
  - ChatGPT's `chatgpt.com` connector callback ⚠️
  - Grok's callback ⚠️ (capture in Phase 0)
- **Sign-in on the consent page:** Sign in with Apple, Google, or an email magic link. Because Google sign-in is offered, Apple requires Sign in with Apple, which is included. Option: "Approve on your phone" via a push to the app.
- **The consent screen grants each permission separately, all off by default except history:**
  `history:read` (window: 7/30/90 days/all) · `highlights:read` · `notes:read` · `shares:read` · `plans:read` · `suggest:write`
- **Grants:** each grant is `(user, client_id, client_name, scopes, history_window, created, last_used, revoked_at)`. Access tokens are short-lived, refresh tokens rotate, and tokens are stored only as hashes.
- **Personal access tokens** (generated in the Agents tab with chosen permissions) cover Claude Code, Codex, scripts, and GrokBot callbacks. These are sent as a `Bearer` header.

### 4.4 Webhook agents (GrokBot)

- **Setup:** Agents → *Add webhook agent* → name, HTTPS URL, permissions. A **signing secret is shown once.**
- **Trigger:** when the user taps **Send to → GrokBot**, the Worker POSTs:

```json
{ "type": "share.created", "id": "evt_…", "created_at": "…",
  "share": { "id": "shr_…", "ref": "John 15:1-11", "verse_start": 43015001, "verse_end": 43015011,
             "translation": "BSB", "text": "…", "highlight": {"color": "promise", "verses": "John 15:5"},
             "note": null, "question": "What does 'abide' mean here?" },
  "context_url": "https://my.biblecli.org/mcp" }
```

- **Headers:** `X-BibleCLI-Signature: t=<ts>,v1=<HMAC-SHA256(secret, ts.body)>`. Retries use exponential backoff for 24 hours. Delivery status appears in Sent.
- **Fetching more context:** GrokBot can call the gateway with its token, within the webhook agent's permissions.
- **GrokBot side (Bailey's bot):** verify the signature, then start a study turn. Where the reply goes is open question 7.

### 4.5 Connecting each platform (onboarding for power users)

| Platform | How | Notes |
|---|---|---|
| **Claude** (web, desktop, mobile) | Settings → Connectors → Add custom connector → `my.biblecli.org/mcp` | Must be **added on the web first**; mobile then uses it. Free plan reportedly allows 1 custom connector |
| **ChatGPT** | Settings → Apps/Connectors → Developer mode → add server | ⚠️ Gated by plan; write actions are reportedly limited on some plans, so `propose_*` may not be available. Read tools still work |
| **Grok app** | grok.com → Connectors → New → Custom → URL | ⚠️ Reportedly paid plans only; no official xAI doc found yet |
| **Claude Code / Codex / CLI** | `claude mcp add --transport http bible-cli https://my.biblecli.org/mcp`, or a personal access token | Fast-follow: `bible login` so the local stdio server can include user tools |
| **GrokBot** | Webhook agent (§4.4) | True push |

Each guide in the app shows: a copy-URL button, a short screen recording, and a **"Test connection"** step. When the connector first calls the gateway, the app shows "Connected ✓".

---

## 5. Send to…

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
| **App Intents / Shortcuts** | later | — | Fast-follow |

**Target picker:** Claude · ChatGPT · Grok · GrokBot · Other (share sheet) · Copy. The user can choose a default, and the last target used is remembered.

**Trademarks:** platform names appear in plain text only, with no third-party logos and nothing implying endorsement.

---

## 6. Donations (DCM 501(c)(3))

- Settings → **Support Bible CLI**, plus a quiet, dismissible prompt at most once per quarter. No features are gated, ever.
- **Launch path: link out** to `biblecli.org/donate` (hosted giving page). ⚠️ Confirm the current wording of App Store guideline 3.2.1(vi) and 3.2.2 for nonprofits and link-outs, and Google Play's Payments policy exemption for donations.
- **Later option:** Apple's approved-nonprofit route allows **in-app donations via Apple Pay**. It requires enrolling in Apple's nonprofit program (open question 5).

---

## 7. Data, licensing, offline

- **Mobile packs**, built in this repo. Add a new `pipeline/stages/mobile.ts`; packs go through `scripts/release-data.sh` with the same manifest, checksums, and verify gate:
  - `bible-mobile-<TR>.db` per translation: `verse_texts` plus full-text search. **BSB is bundled; the others download on demand.** ⚠️ Measure sizes. Today core is about 93 MB on disk, so the full database is not an option.
  - `bible-mobile-xref.db`: cross-references.
  - Fast-follow `bible-mobile-originals.db`: a trimmed words, lexicon, and Strong's layer for tap-a-word.
- **Verse ids:** highlights, notes, shares, and plans store `BBCCCVVV` verse-id ranges, not translation offsets, so they work in any translation.
- **Licensing:**
  - BSB, WEB, KJV, ASV: public domain.
  - Originals and lexicons: CC BY. The About screen shows the attribution.
  - **"World English Bible"** is a trademark: the text must not be modified under that name.
  - ⚠️ **KJV in the UK** (Crown letters patent): decide on the UK storefront.
  - **LXX (CC BY-SA) is not in the app.**
  - Any future licensed translation is **displayed only**. Agents and shares always carry public-domain text, and a share from a licensed reading is sent as the verse id plus BSB text.
- **Shared code:** pull `src/canon.ts` and `src/refparse/` (no Node APIs) into a small package, e.g. `@divine-creative-ministries/bible-core`. The CLI, the app, and the gateway all use it.

### Sync

- Every record has a ULID, `updated_at`, and a soft-delete marker. Conflicts are resolved last-write-wins per record.
- `POST /sync { cursor, ops[] } → { ops[], cursor }` against the user's Durable Object.
- The app works fully offline and syncs when the app comes to the foreground and after edits (with a debounce).

### Core records (per-user Durable Object)

| Record | Key fields |
|---|---|
| `highlight` | id, verse_start, verse_end, color_key, tags[], timestamps |
| `color_legend` | key, label, hex |
| `note` | id, title?, body_md, type, anchors[] (verse ranges), **agent_visible**, source (`user` \| grant id + client name), timestamps |
| `reading_event` | book, chapter, translation, read_at |
| `plan` | id, name, scope, unit, units[], pace, start_date, cursor, source |
| `share` | id (≥10 random characters), range, translation, text, highlight/note snapshot, question, target, delivered_at |
| `suggestion` | id, kind (note \| plan), payload, grant_id, status (pending \| approved \| edited \| rejected), timestamps |
| `grant` / `webhook_agent` | client, scopes, window, secrets stored hashed, last_used, revoked_at |
| `activity` | grant_id, tool, count of items returned, ts (**the content itself is never logged**) |

---

## 8. Privacy & trust

- **Agents see nothing they weren't explicitly granted.** Permissions are set per agent; notes are hidden unless switched on per note; history only within its window; revoking takes effect immediately.
- **Activity log:** e.g. "ChatGPT read 3 notes · Tue 9:14". Visible in the app and exportable.
- **Agents only suggest.** Every write is a suggestion awaiting approval. Text from agents is shown to the user as-is and never runs as a command, which limits prompt-injection risk.
- **Consent copy at connection time:** once data reaches ChatGPT, Claude, or Grok, *that platform's* retention and training policies apply.
- **Regulatory:**
  - Faith notes count as **religious-belief data, a special category under GDPR Art. 9**, so explicit consent is required.
  - Apple's guideline 5.1.2 requires disclosure and permission before personal data is shared with third-party AI.
  - The connection consent screen satisfies both. Store this consent per grant.
- **No analytics on content** (no verse text, note text, or which passages were read). Crash reporting is limited to stack traces only.
- **Data export** (JSON) and **account deletion** (in-app on iOS; web URL for Google Play).

---

## 9. App Store & Google Play

- **Name:** "Bible CLI" ⚠️ check availability on both stores. Suggested subtitle: *"Scripture for you and your AI"*.
- **Avoiding rejection for minimum functionality (4.2) or duplicate apps (4.3):** an offline reader, a journal, plans, and the agent integration are substantive. Lead the screenshots with the Agents tab and Send.
- **Required:** Sign in with Apple (since Google sign-in is offered) · in-app account deletion · privacy label including **Sensitive Info (religious beliefs)** · Google Play Data safety form · a privacy policy URL.
- **Rights to the text:** have the public-domain and CC documentation ready for review.
- **Trademarks:** Claude, ChatGPT, and Grok are named in plain text only, with no logos in the app or store screenshots.
- **Demo account** for reviewers, with a pre-connected agent and sample suggestions, so reviewers can see the inbox flow without a paid AI plan.

---

## 10. Tech stack

| Layer | Choice |
|---|---|
| App | Expo SDK (React Native, TypeScript), Expo Router, `op-sqlite` or `expo-sqlite` (⚠️ confirm FTS5 full-text search), Expo push notifications |
| Native extras | Expo config plugins: Android share intents and package targeting; App Intents / share extension later |
| Backend | Cloudflare Workers: gateway MCP, OAuth (workers-oauth-provider), sync API, webhooks · Durable Objects (per user) · D1 (translation requests, aggregate data) |
| Scripture tools | Existing `mcp.biblecli.org` on Railway (unchanged; adds a header for gateway traffic) |
| Web | Vercel/landing: `biblecli.org/donate`, connector guides, privacy policy |
| Email | Magic links and the optional digest of translation requests |
| Data | This repo's pipeline: mobile packs released via `release-data.sh` |

---

## 11. MVP milestones

| Milestone | Scope | Exit criteria |
|---|---|---|
| **M0 — Spike** (~2 wks) | Verify on real iOS and Android devices: which apps accept shared text; whether prefill URLs open the native app; OAuth gateway prototype connected from **Claude web, ChatGPT dev mode, and Grok**; mobile pack sizes; FTS5 in the chosen SQLite library | A written matrix of what actually works; every ⚠️ in this doc resolved |
| **M1 — Reader & Journal** (offline, no account) | Read (4 translations, parallel view, search, cross-refs), highlights and color legend, notes with switch for agent access, history and pause, plans, Request a translation (signed out), About/licenses | Usable daily as a Bible app on both platforms |
| **M2 — Accounts, sync, connector** | Sign-in, sync, gateway with read tools forwarded from upstream, connect guides, consent screen, Connections and activity log, revoke, export, delete | Claude, ChatGPT, and Grok can each read a test user's context through one URL |
| **M3 — Send & suggestions** | Shares, `get_share` / `get_inbox`, target picker (copy, share sheet, Android direct), `propose_note` / `propose_plan` with suggestions inbox and push notifications, webhook agents and GrokBot | Full round trip: highlight → Send → agent studies it → suggests a note → user approves → note shows "Suggested by …" |
| **M4 — Launch hardening** | Privacy policy and consent copy, store listings and reviewer demo account, donations link, rate limits, security review of OAuth and webhooks, crash reporting | Approved on both stores |

**Fast-follow, in rough priority order:**
1. Tap-a-word originals pack (unless it's pulled into launch; open question 6)
2. MCP Apps verse cards in Claude and ChatGPT
3. `bible login` for the CLI
4. Hosted per-user `study_*` sessions visible in the app
5. iOS App Intents, Shortcuts, and widgets
6. Licensed translations driven by request data (display only)
7. Making connector setup friendlier for church members (directory listings)

---

## 12. Risks

1. **Connector setup is hard and depends on the user's plan:** Claude must be set up on the web first, ChatGPT is gated by plan and write actions, and Grok needs a paid plan. *Mitigation:* the audience is power users first, with excellent guides and a "Test connection" step.
2. **Undocumented hand-off paths** (prefill URLs, share targets). *Mitigation:* the share text stands on its own, prefill URLs sit behind a remote flag, and copy always works.
3. **Expectations about translations.** *Mitigation:* BSB is a strong modern default, and Request a translation turns the gap into a roadmap.
4. **Trust and security:** the OAuth server and spiritual data. *Mitigation:* per-user Durable Object isolation, hashed tokens, no content in logs, a security review in M4.
5. **Store review** (crowded Bible category, AI disclosure). *Mitigation:* §9 checklist and the reviewer demo account.
6. **Hosting load:** the upstream server launches a process per tool call. *Mitigation:* app reading never hits the server; the gateway rate-limits; scale Railway only if agent traffic grows.

---

## 13. Remaining open questions

1. **Default for "Agents can see this" on new notes:** off (recommended, safer) or on (more useful for power users)? Should **highlights** also get a per-item switch, or is the per-agent `highlights:read` permission enough?
2. **Repo layout:** a new `bible-cli-app` repo (app plus gateway) and a published `bible-core` package (recommended), or a monorepo inside this repo?
3. **Gateway domain:** `my.biblecli.org/mcp`, or something else?
4. **Store name:** "Bible CLI" is decided; is the subtitle OK? Does the "CLI" wording need explaining for the later church audience?
5. **Donations:** which giving processor or page should `biblecli.org/donate` use? Should DCM enroll in Apple's nonprofit program for in-app Apple Pay donations later?
6. **Tap-a-word originals:** in the launch, or the first fast-follow?
7. **GrokBot behavior:** when a webhook arrives, where does GrokBot reply (Telegram, X, its own UI)? Should it be able to send suggestions back through `propose_*`?
8. **History detail and agent default:** chapter-level only (proposed), and what default window agents see (proposed: 30 days)?
9. **Translation requests:** keep the tally private (proposed), or show a public "most requested" list?
10. **Legal:** who drafts the privacy policy and Art. 9 consent copy? What is the UK KJV decision?
11. **Ops:** who is on call for the gateway, and what is the monthly hosting budget ceiling?
12. **Localization and accessibility:** English-only UI at launch? Confirm VoiceOver/TalkBack and Dynamic Type as launch requirements (recommended: yes).

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
