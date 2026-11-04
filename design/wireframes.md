# Wireframes — Bible CLI mobile (MVP)

Low-fidelity layouts with the reasoning behind each. The clickable version is
[`prototype.html`](prototype.html) (the `#id` after each title is its anchor).
Legend: `[Button]` · `( ) radio` · `[x] check` · `◐ toggle` · `◆` agent-made ·
`▾` picker · `›` drill-in.

---

## Onboarding

### O1 · Welcome `#onb-welcome`
```
┌──────────────────────────────┐
│                              │
│  Bible CLI▌                  │  wordmark, red cursor
│  Scripture for you           │
│  and your AI.                │
│  BSB built in · offline ·    │
│  no account needed to read   │
│  αβ  Greek & Hebrew          │
│  ⋔   ChatGPT, Claude, Grok Bot│
│  ♡   Free, donation-supported│
│                              │
│  [ Get started ]             │
└──────────────────────────────┘
```

### O2 · Greek & Hebrew pack `#onb-originals`
```
│ ━━ ━━ ── ──                  │  4-step progress
│ Greek & Hebrew, one tap away │
│ ┌──────────────────────────┐ │
│ │⁴ ▁Remain▁ in Me, and I…  │ │  live demo of tap-a-word
│ │ μείνατε  meinate  G3306  │ │
│ └──────────────────────────┘ │
│ ⤓ Download Greek & Hebrew ◐on│  ≈ N MB · Wi-Fi or cellular
│ Skip → Settings or first tap │
│ [ Continue ]                 │
```
- The default is **on**. The download runs in the background, and a progress pill follows the user through O3–O4.

### O3 · Your notes and AI agents (consent) `#onb-consent`
```
│ ━━ ━━ ━━ ──      ◔ G&H 62%  │
│ Your notes and AI agents     │
│ ▢ What's shared              │
│ ▢ Defaults (visible, Full)   │
│ ▢ Why it's sensitive (Art.9) │
│ ▢ Third parties              │
│ ▢ You stay in control        │
│ ┌──────────────────────────┐ │
│ │ I agree — let agents I   │ │  equal weight,
│ │ connect read my notes…   │ │  nothing pre-selected
│ └──────────────────────────┘ │
│ ┌──────────────────────────┐ │
│ │ Not now                  │ │
│ └──────────────────────────┘ │
│ consent text v1 · 2026-11    │
```
- **Not now:** a banner on the Agents tab ("Agents can't read your notes yet → Review consent"). The screen reappears on the first *Add an agent*.

### O4 · Sign in (optional) `#onb-signin`
Apple · Google · email · **Skip — just read**. Copy: needed only for sync and agents.

### O5 · Connect an agent (optional) `#onb-connect`
Three equal rows (ChatGPT · Claude · Grok Bot) → guides. Footnote: Full access by default. `[Start reading]` `Later`.

---

## Read

### R1 · Reader `#read`
```
┌──────────────────────────────┐
│ John 15 ▾  [BSB]     ⌕ αβ Aa │  one bar; hides on scroll
│ (◆ 1 research)(✎ 1 note)(●● 2)│  chapter context chips
│ ┌ Tap any word to see the  ┐ │  coach mark, first run only
│ └ Greek behind it.  Got it ┘ │
│ 15 ¹"I am the true vine, and │  big red chapter numeral
│    My Father is the keeper…  │  red superscript verse nos.
│ ⁴◆Remain in Me, and I will   │  ◆ = agent research here
│ remain in you…               │
│ ⁵▓I am the vine and you are▓ │  user highlight (promise)
│ …⁷ If you remain in Me… ✎    │  ✎ = your note
│ ┌ Gospel of John · day 15/21 ┐│  plan strip, [Mark read]
│ ‹ John 14          John 16 › │
├──────────────────────────────┤
│  Read  Journal  Plans  Agents│
└──────────────────────────────┘
```
- Paragraph flow by default; verse-per-line in Aa. Cross-ref markers are small grey letters.
- Reading is recorded at chapter level, and Pause history is in Aa.

### R2 · Verse action bar `#read/sel-4-5`
```
│ ⁴░Remain in Me…░ ⁵░I am…░    │  selected = red tint + underline
│ ╭────────────────────────────╮│
│ │ John 15:4–5 · 2 verses   ✕ ││  replaces the tab bar
│ │ ✎hl  ✎note [➤Send to…] ⧉  αβ ⋯││  Send is the filled hero
│ ╰────────────────────────────╯│
```
- **More ⋯** → Compare (parallel) · Cross-references · Share…
- **Copy** = "Copy with context" (ref, translation, your highlight label, share id).

### R3 · Highlight `#read/hl`
A sheet with named swatches: promise · command · question · prayer · *name this color…*, each with a count. A tags field, and [Remove].

### R4 · Note composer `#read/note`
Passage chips (+ passage), type chips (journal default), a Markdown field in serif, and an **eye toggle (visible to agents, on)**. [Save].

### R5 · Send to… `#read/send`
```
│ Send John 15:4–5           ✕ │
│ ┌──────┐┌──────┐┌──────┐     │
│ │  Cg  ││  Cl  ││  GB  │     │  equal tiles, A→Z
│ │ChatGPT││Claude││GrokBot│    │  "last" tag on last used
│ └──────┘└──────┘└──────┘     │
│ [⇪ Other…]  [⧉ Copy]         │
│ [ Your question (optional) ] │
│ [x] Include my highlight     │
│ [ ] Include my note on v.7   │
│ PREVIEW              iOS|And │
│ ┌ Let's study John 15:4–5 …┐ │  exact share text, mono
│ └ [bible-cli share shr_…]  ┘ │
│ ⓘ iOS: we copy, then open    │
│   Claude. Also in your inbox.│
│ [ ➤ Copy & open Claude ]     │  Android: "Send to Claude"
```

### R6 · Tap-a-word sheet `#read/word-meinate`
```
│ …unless you remain in Me. ⁵  │  tapped phrase scrolled above,
│ I am the vine… ▁remains▁ …   │  backdrop nearly clear
│╭─────────── ═══ ────────────╮│
││ John 15:5                ✕ ││
││ μένων  menōn  [G3306]      ││
││ Dictionary form μένω · verb ││
││ ┃ In this verse, BSB:      ││
││ ┃ "remains"                ││  inverse lookup first
││ PARSING          V-PAP-NSM ││
││ Present · active · partici- ││  plain English + code
││ ple — "the one who remains"││
││ BSB TRANSLATES μένω AS     ││
││ remain   ████████████  ≈45 ││  tap a bar → filter
││ stay     ██████        ≈24 ││  occurrences
││ abide    ██             ≈9 ││
││ WHERE IT OCCURS 118 in 102  ││
││ ▁▁▂█▃▁▂▁ … ▅▁▁ (John, 1 Jn)││
││ LEXICON  Dodson · Abbott-S. ││
││ OCCURRENCES          All › ││
││ [➤ Send word study][✎ Note]││
│╰────────────────────────────╯│
```
- **Supplied words** (`#read/word-sup-v4`): "Added for English sense". Shows the Greek actually there (κἀγὼ ἐν ὑμῖν, "and I in you") and a link to the interlinear.
- **No pack** (`#read/pack`): a one-sheet prompt. [Download now] / Not now.

### R7 · Original (verse sheet) `#read/orig`
The selected verse's English, then word blocks (original + gloss). [Open interlinear view] [Send word study].

### R8 · Interlinear `#interlinear` · Hebrew `#hebrew`
```
│ John 15 ▾ [BSB · Greek]  (αβ)│  αβ lit = on
│ (Gloss)(+Translit)(+Parsing) │
│ ⁴ Remain in Me, and I will…  │  English line on top
│ μείνατε  ἐν   ἐμοί  κἀγώ …   │  blocks in Greek order
│ meinate  en   emoi  kagō     │
│ remain   in   Me    and I    │
│ V-AAM-2P PREP P-1DS P-1NS    │
```
- Tap a block → its English phrase highlights and the word sheet opens.
- Hebrew blocks flow **right to left**. Glosses stay LTR, and the Hebrew is about 1.25× larger. אֵת shows "not translated separately".

### R9 · Parallel `#parallel`
Two verse-aligned columns (BSB | KJV, each a picker), with swap and close. The selected verse is tinted. When the pack is installed, the same lemma is marked in both columns (μένω: *remain* ↔ *abide*).

### R10 · Search `#search`
A query field and scope chips (All · Gospels · John · translation ▾), with results as ref + snippet. A typed reference jumps straight there; `G3306` or `μένω` searches by original word.

### R11 · Display (Aa) `#read/aa`
A−/A+ · Paper/Night · Interlinear · Parallel ▾ · Verse-per-line · Cross-ref markers · **Pause history** · All settings ›.

---

## Journal

Shared header: large title **Journal**, segmented **Highlights | Notes | Research**, search, +, gear.

### J1 · Highlights `#j-highlights`
Legend chips with counts (promise 12 · command 5 · …) act as filters. [Edit color legend] opens a sheet that renames colors. Cards are grouped by book: color bar, ref, label, date, snippet. Footnote: agents receive the legend.

### J2 · Notes `#j-notes`
Type chips. Cards show a passage chip, type and date, title, snippet, author (`You` or `◆ Saved by ChatGPT`), and the **eye** in the corner. Hidden cards show a closed eye and "Hidden from agents".

### J3 · Research `#j-research`
```
│ (All)(Claude)(ChatGPT)(Grok Bot)(You)(John)│
│ ┃ NEW ◆ Saved by Claude · 9:14 │  agent-ink left border
│ ┃ Remain in Me — μένω in Jn 15 │
│ ┃ John uses μένω 40 times…     │
│ ┃ [John 15:1–11][1 John 2:24]  │  chips open Read
│ ┃ ◆ Saved by Grok Bot · Nov 2  │
│ ┃ "Comfort, comfort" — Isa 40–55│
│ │ ● Pasted by you   (eye off)  │
```

### J4 · Research detail `#research-detail`
Byline (◆ Saved by Claude · time), title in serif, passage chips, "Open conversation ↗", visible/hidden state. The body uses **OBSERVED / PATTERN / INFERENCE** labels and a "Tools used" mono line. Actions: **Undo this save** (30 days) · Respond with a note. Header: eye · send.

---

## Plans

### P1 · Plans `#plans`
A dark **Today** card (day 15 of 21 · John 15 · [Read now] [Mark read]), then a list of plans with progress bars (agent-made plans carry ◆ Saved by ChatGPT). + opens **New plan**: scope, unit (chapters/chunks), pace (shows the resulting duration), start. No streaks.

### P2 · History `#history`
A **Pause history** toggle at the top (with "agents see last 30 days"). A day-grouped timeline: chapter, translation, time. Swipe to delete. [Clear history].

---

## Agents

### A1 · Agents home `#agents`
```
│ Agents                   + ⚙ │
│ ┌ ⊡ Needs your approval  (2)┐│  only when > 0
│ FROM YOUR AGENTS · TODAY  Log│
│ Cl Claude saved research "…" Undo│
│ Cg ChatGPT saved a note "…"  Undo│
│ GB Grok Bot read 3 notes…  (grey)│  reads collapsed, no undo
│ CONNECTED                    │
│ Cg ChatGPT · Approval req. › │
│ Cl Claude · Full · 100/100 ⚠ ›│  limit state on the row
│ GB Grok Bot · Full · ••••7Q2k ›│
│ +  Add an agent              │
│ ⚿ Personal access tokens (2) ›│
│ ➤ Sent · last: John 15:4–5  ›│
```
- No consent → a banner at the top: "Agents can't read your notes yet — Review consent".

### A2 · Approval inbox `#approvals`
One card per item: agent, kind, time, **reason chip** (`approval mode` / `over daily limit · #101`), title, snippet, passage chips, and a bottom row **Reject | Edit | Approve**. "Approve all" in the header. Empty state: "All caught up".

### A3 · Agent page `#agent-claude`
```
│ Cl  Claude                   │
│     OAuth · connected Nov 3  │
│ PERMISSION MODE              │
│ (●) Full access · default    │  one-line consequence each
│ ( ) Approval required        │
│ ( ) Read only                │
│ ↳ "Saves land right away…"   │  live explanation on change
│ CLAUDE CAN READ              │
│ ◐ Reading history  30 days ▾ │
│ ◐ Highlights & legend        │
│ ◐ Notes (never hidden)  ◐ Research │
│ ◐ Plans   ◐ Things you send  │
│ DAILY LIMIT ◐ 100/day · 100 used│
│ ◐ Notify me on saves         │
│ TODAY  read 3 · saved 100 · 1 waiting │
│ ↶ Undo everything Claude saved today │
│ Rename   ·   Revoke access   │
```

### A4 · Activity log `#activity`
Agent filter chips, with day-grouped monospace lines: `09:14 Claude save_research "…" → saved`, `07:58 Grok Bot search_notes → 3 (1 hidden, not returned)`. [Export]. Footnote: content is never stored.

### A5 · Add an agent `#add-agent`
First-class rows (ChatGPT · Claude · Grok Bot), then "Also works with" (Grok, Claude Code / Codex / Cursor, any MCP client). A copy row for the MCP URL `https://my.biblecli.org/mcp`.

### A6 · Connect via OAuth `#connect-claude`
A segmented control: From the directory | Custom connector. Three numbered steps, then a preview of the **Bible CLI sign-in page** (agent name, mode preset Full access, data access, limit, [Customize] [Allow]), then a **Test connection** card (Scripture ✓ · Reads ✓ · Saves ✓, [Run again]).

### A7 · Create token `#connect-grok` → Token created `#token-created`
Form: name · mode · can read (customize) · daily limit · **Expires: Never | 30d | 90d | 1y** · warning copy ("This token will live on that service…") · [Create token]. Result: the token in a dashed mono box, **shown once**, [Copy token], then copy rows for Grok Bot (Name · URL · Header) and [I've added it — test connection].

### A8 · Access tokens `#tokens`
Cards: name, last 4, mode, expiry, last used, [Regenerate] [Revoke]. + creates a new one.

---

## Settings `#settings`

Pushed from the gear (no tab bar).
- **Translations:** BSB (built in) · KJV (Remove) · WEB · ASV (Download) · Greek & Hebrew (Remove) · **Request a translation ›**
- **Reading:** text size & theme · Pause reading history · cross-ref markers
- **Agents & privacy:** consent status + **Withdraw** · Agents can see new notes ◐ · Default mode (Full access) · Default daily limit (100) · History agents can see (30 days)
- **Account:** sign-in method · Export all data (JSON) · Delete account
- **Support Bible CLI ♡ ›** · About & licenses · Privacy · Terms · Support

### S1 · Request a translation `#request`
No-promise copy at the top, then search, a multi-select list (ESV, NASB, NIV, CSB/NLT/LSB/NKJV, Other…), optional language and why, and **Notify me** (needs an account). [Send request] → "Thanks — counted. One vote per translation."

### S2 · Support Bible CLI `#donate`
A heart, then "Bible CLI is free. No paywalls, ever.", the DCM 501(c)(3) line, and three rows on what gifts fund. [Give at biblecli.org ↗] (opens the browser). A tax note.
