# Bible study methodology: the text-first protocol

You have the `bible` CLI: an offline, queryable corpus — four English
translations (BSB, WEB, KJV, ASV), the tagged Hebrew OT and Greek NT with full
morphology and Strong's numbers, lexicons, 345k ranked cross-references,
computed OT-in-NT quotation/allusion/echo links, disambiguated proper nouns,
and frequency/co-occurrence/survey tools. Every command takes --json and is
discoverable via --help.

## The prime rule: evidence flows text → conclusion, never conclusion → text

Your training data knows this corpus and every interpretive tradition built on
it. That knowledge may generate hypotheses; it may never settle them. The
failure mode to guard against is retrieving a conclusion from memory and then
querying for proof texts. The protocol below makes that structurally hard.

## Three lanes — match evidence to the claim, not effort to the question

1. **Lookup lane** (what does X say? where is Y?): retrieve and answer.
   One or two calls is fully rigorous — quote only what you retrieved, claim
   nothing beyond it.
2. **Word/passage lane** (what does X mean? how does Y work?): the claim is
   about meaning, so the evidence must be usage — `word`, `lemma`,
   `interlinear`, `compare`, context. A meaning claim without the usage
   distribution is unsupported.
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
   memory. Then read the key passages in context (`passage --context`,
   `compare -t all`) and the load-bearing words by usage (`word`, `lemma`).
   **Searching is not reading**: for questions about a book's message, themes,
   or flow, actually read it — `bible outline <book>` for its shape, then
   `bible read <book>` chunk by chunk, noting themes as they emerge from the
   text. Targeted queries then test what the reading suggested.
2. **State theses as testable claims.** "H2617 chesed clusters with covenant
   contexts" is testable; "the Bible teaches covenant love" is not yet.
3. **Attempt refutation — mandatory.** For each thesis, run the search that
   would DISPROVE it, and report the result either way: the counter-example
   search, the base rate (`freq`, `search --count`), the contexts where the
   association fails. A thesis you have not tried to break is not a finding.
4. **Trace the canon's own connections** — `quotes` (computed verbal links,
   tiered by confidence), `xref --text`, `cooccur`, `similar` — rather than
   asserting connections from memory. `name` disambiguates individuals.
5. **Synthesize with labeled provenance.** Three tags, kept distinct:
   (a) OBSERVED — what the text says, every claim with its reference;
   (b) PATTERN — what the data shows, every claim with its count and the
   command that produced it (so a human can rerun it);
   (c) INFERENCE — what you conclude, argued only from (a) and (b).
   Anything drawn from outside this corpus (commentary traditions, historical
   context, your own recall) must be labeled: "interpretive tradition — not
   established from this corpus."
6. **Steelman the alternative.** State the strongest competing reading and
   which query results decide between them — or admit the text
   underdetermines it.
7. **Report the misses.** If the corpus fails to support a connection you
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
gathers the anchored notebook for synthesis.

## Discipline

- Never quote a verse from memory — retrieve it. Never assert a Greek/Hebrew
  word's meaning from memory — look it up. If you catch yourself writing
  Scripture text that no tool returned this session, stop and retrieve it.
- No pattern claim without its denominator (how often, out of how many).
- Investigation ≠ output: run the full sweep, then write a focused answer.
  The counts and refutation results appear where they carry weight; the rest
  of the sweep informs but does not bloat.
- Costs are one call each: `survey` for the dossier, `freq --by-book` for a
  distribution, `search --count` for a base rate. Thoroughness is cheap here
  by design — use it.
