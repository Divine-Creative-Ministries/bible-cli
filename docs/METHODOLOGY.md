# Bible study methodology: the text-first protocol

You have the `bible` CLI: an offline, queryable corpus — four English
translations (BSB, WEB, KJV, ASV, plus any user-imported), the tagged Hebrew
OT and Greek NT with full morphology and Strong's numbers, clause-level syntax
trees (who did what to whom), lexicons, 345k ranked cross-references, computed
OT-in-NT quotation links AND inner-biblical parallels (OT↔OT, NT↔NT), Greek
edition variants and Ketiv/Qere, proper-noun disambiguation, formula search,
reading sessions with a durable notebook, and raw read-only SQL. Every command
takes --json and is discoverable via --help. If anything misbehaves, run
`bible doctor` first.

## The prime rule: evidence flows text → conclusion, never conclusion → text

Your training data knows this corpus and every interpretive tradition built on
it. That knowledge may generate hypotheses; it may never settle them. The
failure mode to guard against is retrieving a conclusion from memory and then
querying for proof texts. The protocol below makes that structurally hard.

## The second rule: reading is the foundation, queries are the instruments

Depth comes from reading large, connected stretches of text — whole chapters
and whole books — not from stitching together search hits. A verse quoted
without its literary unit read is context-free data; themes, arguments, and
narrative arcs only become visible across continuous text. So the deeper the
question, the more you READ before you query: searches and analytics then test
what the reading surfaced, never substitute for it. Reading whole books is
cheap here by design (`read` pages any book in a handful of calls) — use it.

## Match the tool to the question

- What does the text SAY → `passage` (with --context), `read` (a chapter or
  whole book in flowing chunks), `outline` (a book's shape in one call).
- What does a WORD mean → `word` (lexicon + usage), `lemma` (every
  occurrence), `interlinear`/`original`/`morph` (the text itself), `freq`
  (distribution). Meaning claims require usage, not one gloss.
- WHO DID WHAT TO WHOM (subjects, objects, negation — grammar-level claims) →
  `syntax` (--subject/--verb/--object/--negated). "God remembers" as a
  grammatical fact is `syntax --subject H430 --verb H2142`, not word
  proximity.
- Where translations DIVERGE / what the textual evidence is → `compare -t all`
  first; where wording is load-bearing, `variants` (Greek editions, Ketiv/
  Qere — printed-edition-level evidence, labeled as such).
- How the canon CONNECTS to a passage → `xref --text` (ranked cross-refs),
  `quotes` (computed OT-in-NT links), `parallels` (computed OT↔OT and NT↔NT
  reuse: Kings↔Chronicles, Synoptics, doubled psalms), `similar` (shared rare
  vocabulary), `cooccur`. `name` disambiguates people/places.
- Is this REPEATED PHRASING a real formula → `pattern --formula` (original-
  language sequences with observed-vs-expected concentration).
- TOPIC overview before any thesis → `survey` (the corpus's own structure:
  distributions, top passages, connections — one call).
- A question none of the above answers → `schema` then `sql` (read-only).
- Book-scale or multi-session study → `study` (the inductive loop below).

## Three lanes — match evidence to the claim, not effort to the question

1. **Lookup lane** (what does X say? where is Y?): retrieve and answer.
   One or two calls is fully rigorous — quote only what you retrieved, claim
   nothing beyond it.
2. **Word/passage lane** (what does X mean? how does Y work?): the claim is
   about meaning, so the evidence must be usage — `word`, `lemma`,
   `interlinear`, `compare` — AND context: read the whole literary unit
   (`read <book chapter>`, not just the verse) before explaining any passage.
   A meaning claim without the usage distribution is unsupported; a passage
   claim without its surrounding chapter read is uncontextualized.
3. **Study lane** (study/pattern/theology-of/theme requests, or any claim that
   generalizes across the canon): the full protocol below, both testaments,
   misses reported.

**Escalation tripwires** — promote to a higher lane the moment any fires:
translations diverge at the load-bearing phrase; the argument leans on a
theologically loaded term; your draft answer contains always/never/every/
consistently; the claim crosses testaments; you notice you already believed
the conclusion before searching.

## The study-lane protocol

1. **Discovery before thesis.** Open with `bible survey <topic|word|ref>` and
   read the corpus's own structure — distributions, top passages,
   cross-references, quotation links — BEFORE writing any interpretive
   sentence. Your outline must come from what the survey surfaced, not from
   memory.
2. **Read before you search.** For any question touching a book's message,
   themes, argument, or narrative: `outline <book>` for its shape, then
   `read <book>` chunk by chunk — actually read it, noting what the text
   emphasizes. For studies spanning sessions or multiple books, run it as a
   `study` session so observations persist. Then read the key passages the
   survey surfaced in full context (`passage --context`, or better, the whole
   chapter via `read`) and the load-bearing words by usage (`word`,
   `lemma`). Targeted queries then test what the reading suggested —
   **searching is not reading**.
3. **State theses as testable claims.** "H2617 chesed clusters with covenant
   contexts" is testable; "the Bible teaches covenant love" is not yet. Where
   a thesis is grammatical (who acts, who receives, negated or not), test it
   with `syntax`; where it claims a formula, test with `pattern` and its
   expected-vs-observed ratio.
4. **Attempt refutation — mandatory.** For each thesis, run the search that
   would DISPROVE it, and report the result either way: the counter-example
   search, the base rate (`freq`, `search --count`, `pattern`'s expected
   ratio), the contexts where the association fails. A thesis you have not
   tried to break is not a finding.
5. **Trace the canon's own connections** — `quotes`, `parallels`,
   `xref --text`, `cooccur`, `similar` — rather than asserting connections
   from memory. When wording carries the argument, check `variants`: an
   edition-disputed word cannot bear interpretive weight silently.
6. **Synthesize with labeled provenance.** Three tags, kept distinct:
   (a) OBSERVED — what the text says, every claim with its reference;
   (b) PATTERN — what the data shows, every claim with its count and the
   command that produced it (so a human can rerun it);
   (c) INFERENCE — what you conclude, argued only from (a) and (b).
   Anything drawn from outside this corpus (commentary traditions, historical
   context, your own recall) must be labeled: "interpretive tradition — not
   established from this corpus."
7. **Steelman the alternative.** State the strongest competing reading and
   which query results decide between them — or admit the text
   underdetermines it.
8. **Report the misses.** If the corpus fails to support a connection you
   expected, say so plainly. Negative results are results.

## The inductive reading loop (multi-session, book-scale study)

`bible study` makes the read-first workflow durable: a session cursor plus a
verse-anchored notebook. `study start <scope>` (--bare for blind reading),
then `study next` unit by unit. Read without commentary; record what YOU see
as you go — `study note "..." --type observation|question`, each note anchored
to exact verses (--refs, or it anchors to the unit just read). Promote what
recurs to `--type pattern`; `study next` then surfaces recurrences of open
patterns/questions by shared distinctive vocabulary. Search intentionally only
after the text raises the question — search follows observation. Before
concluding, test each pattern: `--type counterexample --against <id>`, settle
with `study resolve <id> --status supported|refuted`, then record
`--type conclusion`. `study coverage` shows unread gaps; `study review`
gathers the anchored notebook for synthesis. Never let notes drift from the
text: a note is only as good as the verses it is anchored to.

## Discipline

- Never quote a verse from memory — retrieve it. Never assert a Greek/Hebrew
  word's meaning from memory — look it up. If you catch yourself writing
  Scripture text that no tool returned this session, stop and retrieve it.
- No pattern claim without its denominator (how often, out of how many).
- Never explain a passage whose surrounding chapter you have not read this
  session.
- Investigation ≠ output: run the full sweep, then write a focused answer.
  The counts and refutation results appear where they carry weight; the rest
  of the sweep informs but does not bloat.
- Costs are one call each: `survey` for the dossier, `freq --by-book` for a
  distribution, `search --count` for a base rate, `read` for a whole chapter.
  Thoroughness is cheap here by design — use it.
