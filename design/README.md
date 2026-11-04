# Bible CLI mobile — UI/UX design exploration

Design pass for the iOS + Android app described in
[`docs/mobile-app-plan.md`](../docs/mobile-app-plan.md) (draft v4). Mockups only:
no app code.

**Open on your phone:**
<https://raw.githack.com/Divine-Creative-Ministries/bible-cli/design/mobile-app-ux/design/index.html>

| File | What |
|---|---|
| [`index.html`](index.html) | Hub: the five key flows with a link to every step, plus a screen index |
| [`prototype.html`](prototype.html) | Clickable prototype in the recommended direction (28 screens + 9 sheets) |
| [`directions.html`](directions.html) | The same moment drawn in three visual directions |
| [`wireframes.md`](wireframes.md) | Screen-by-screen wireframes with notes |

Real data: Greek/Hebrew forms, parsing, glosses, lexicon lines, and per-book
counts come from `bible` (data-v0.2.x). BSB rendering counts ("≈45 remain") are
text-match approximations until the alignment stage lands.

---

## 1. Visual direction

| | **Rubric** ✅ | Vigil | Clearwater |
|---|---|---|---|
| Mood | Paper and ink, red rubrication; a quiet manuscript | Dark first, candlelit, CLI-forward | Bright, system-native, productivity app |
| Scripture type | Literata (serif, covers Greek) | Newsreader | Inter (sans) |
| UI / meta type | Inter · IBM Plex Mono for refs, Strong's, tokens | Plex Sans · Plex Mono everywhere | Inter / SF / Roboto |
| Color | Paper `#f5f0e6`, ink, **rubric red** for structure, **slate blue for anything an agent made** | Night, candle amber, teal agents | White, system blue, violet agents |
| Density | Airy reader, medium lists, detail on demand | High: codes inline, tool calls visible | Low to medium |
| Risk | Can look dated if the type isn't crisp | Feels like a dev tool to future church users | Generic, not reverent; violet-for-AI cliché |

**Recommendation: Rubric**, with a "Night" theme that borrows Vigil's palette
(already wired: toggle in the prototype's Aa menu).

- It feels like a Bible before it feels like software, which matters for reverence
  and for the church-member audience later.
- **Two inks give provenance a visual language:** red is the text and its
  structure, slate blue is your agents. "Saved by Claude", the ◆ research marker
  in the reader, and the agent-card border all use the agent ink, so users learn
  it at a glance.
- The power-user layer (Strong's, morph codes, tool names, `bcli_pat_…`) sits in
  a small monospace voice that nods to the CLI brand without taking over.

### Principles used throughout
1. **Text first.** The reader has no chrome beyond one bar. Everything else is a sheet you pull up and dismiss.
2. **Provenance is always visible.** Anything an agent created carries its name and the agent ink, and has Undo.
3. **Power on demand.** Plain-English parsing first, codes beside it in small mono.
4. **Equal agents.** ChatGPT · Claude · Grok Bot always appear in alphabetical order, with the same tile and size, in text only (no logos).
5. **Calm.** No streaks and no badges except pending approvals. The donation prompt stays quiet.
6. **Honest about platforms.** iOS "Copy & open", Android "Send to", and the inbox are all said plainly in the UI.

---

## 2. Structure and gestures

**Four tabs:** Read · Journal · Plans · Agents. **Settings** is the gear on
each tab's large-title header. (Read hides it to stay clean; reach it from Aa →
All settings, or from any other tab.)

| Gesture (Read) | Result |
|---|---|
| **Tap a word** (BSB + originals pack) | Highlights the English phrase, scrolls it above a half-height **word sheet** |
| **Tap a red verse number** / long-press a verse | Selects the verse. The **tab bar turns into the action bar.** Tap more numbers to extend the selection |
| Tap a word with no pack | One-sheet "Download Greek & Hebrew" prompt |
| Tap a word in WEB/KJV/ASV | Opens the verse interlinear (Original), until KJV tags land |
| **αβ** in the reader bar | Interlinear view |
| Pull the word sheet up | Full height: renderings, distribution, lexicon, occurrences |

**Action bar:** Highlight · Note · **Send to…** (the filled red "hero" action) ·
Copy · Original · More (Compare/parallel, Cross-references, Share…).

---

## 3. Key flows

Each step links to a prototype state in [`index.html`](index.html).

**A. Highlight and send to ChatGPT / Claude / Grok Bot**
1. Tap verse numbers 4 and 5, and the action bar appears.
2. Highlight → pick "promise" (the user's named color).
3. Send to… → the target is preselected from last time. Add a question and include the highlight/note. The preview shows exactly what's shared.
4. **iOS:** "Copy & open Claude" (copies, then opens the app; the user pastes). **Android:** "Send to Claude" (direct intent). Other → share sheet. Copy → clipboard.
5. Every path also drops the passage in the **inbox**, so "check what I sent" works in all three, including Grok Bot even if it can't take shared text.

**B. Agent saves research → Journal**
1. The agent calls `save_research` (Full access) → saved.
2. Push: "Claude saved research…". Tap → research detail.
3. Journal → Research: card on top with *New · Saved by Claude* and the agent-ink border.
4. Reader: a "1 research" chip on John 15 and ◆ at v.4. Agents feed: row with Undo.

**C. Approve or undo**
1. Agents tab badge → **Needs approval**. Each card shows a reason chip: *approval mode* or *over daily limit #101*.
2. Reject · Edit · Approve per card, or Approve all. Each decision shows a toast with Undo.
3. Undo a saved item from the feed row, the item itself, or **"Undo everything Claude saved today"** on the agent page. Items are restorable for 30 days.
4. Tighten up: switch the agent's mode on its page. The change applies on the next call, and the page explains what changes.

**D. Connect a new agent**
1. Agents → + → ChatGPT / Claude / Grok Bot (others below). Consent is shown first if it was "Not now".
2. Directory path: Connect → Bible CLI sign-in page with mode preset to **Full access**, data access, and limit → Allow / Customize.
3. Back in the app: **Test connection** (Scripture ✓ · Reads ✓ · Saves ✓), then a first-connect push: "…connected with Full access. Change?"
4. Token path (Grok Bot): Create token → name, mode, expiry (**Never** default) → **shown once**, with copy rows for Name / URL / Header → test.

**E. Start reading with tap-a-word**
1. Onboarding offers the pack, **on by default**. It downloads during consent and sign-in (progress pill).
2. First read: a one-line coach mark ("Tap any word…").
3. Tap "Remain" → μείνατε sheet: plain-English parsing, *"BSB translates μένω as"* bars (tappable filters), per-book distribution, lexicon, occurrences, **Send word study** / **Add to note**.
4. Tap "will remain" → *Added for English sense* (the Greek has no verb there; it's a real BSB example).
5. αβ → interlinear (Greek order; tap a block to highlight its English). The Hebrew interlinear runs RTL.

---

## 4. Decisions worth a look

- **Action bar replaces the tab bar** while verses are selected, so the reader never shows two bottom bars. Send to… is the one filled button.
- **The word sheet opens at about 60% height and scrolls the tapped word into view above it**, with a near-clear backdrop so the verse stays readable.
- **Consent buttons have equal visual weight** (both outlined, same size, nothing pre-selected), which suits GDPR Art. 9 explicit consent. The text version stamp is shown.
- **Daily-limit state is visible where it matters:** on the agent row ("100/100 today — limit reached"), on the agent page, and as the reason on the pending card.
- **The activity log is monospace** and says plainly "never stores the content". Hidden notes show as "(1 hidden, not returned)".
- **The eye switch sits on every note and research card.** Hidden cards show a closed eye plus a "Hidden from agents" label.
- **Agent marks are neutral monograms** (`Cg` `Cl` `GB`) in the same color for all three. No brand colors, no logos.
- **Plans have no streaks.** A missed day just moves the cursor. History is a quiet timeline with Pause and Clear.
- **Donate is a single calm page** that links out to biblecli.org, with no in-app payment UI.

---

## 5. UX open questions for Bailey

1. **Direction:** go with Rubric (paper + red + slate-blue agent ink), with Night as dark mode?
2. **Settings entry:** a gear on each tab header (as mocked), or a 5th tab / profile avatar?
3. **Tap vs. select:** tap = word study and tap the verse number = select (as mocked). Should long-press also select, or should it be reserved for a word's quick-peek?
4. **Agent marks:** are plain-text monograms (`Cg` `Cl` `GB`) OK under the no-logos rule, or text-only names with no mark at all?
5. **iOS Send:** is "Copy & open Claude" acceptable as the main iOS path (pending an M0 check that universal links open each app)?
6. **Agent saves in the reader:** keep the ◆ verse marker and chapter chip, or show agent research only in the Journal?
7. **Push on every Full-access save,** or a daily digest by default (notifications are on per agent today)?
8. **Pending items:** should they expire (e.g. after 30 days, like Undo), or wait forever?
9. **Parallel view on phones:** side-by-side columns (as mocked) or stacked per verse?
10. **Interlinear default:** gloss only, or gloss + transliteration? And should cantillation marks be hidden by default for Hebrew?
11. **Highlight legend:** ship with the four suggested names (promise, command, question, prayer), or unnamed colors the user names?
12. **Accessibility bar:** treat Dynamic Type up to AX5 on the reader and word sheet as a launch requirement?
