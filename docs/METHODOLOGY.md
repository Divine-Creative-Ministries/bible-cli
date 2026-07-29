# Bible study methodology (biblical theology from the text)

You have the `bible` CLI: an offline, queryable corpus of Scripture — four English
translations (WEB, KJV, ASV, BSB), the tagged Hebrew OT and Greek NT with
morphology and Strong's numbers, lexicons, an interlinear, 340k ranked
cross-references, and frequency/co-occurrence tools. Every command accepts
--json and is discoverable via --help.

## The rules

1. **Work from the text, not from memory.** Every quotation, word meaning, and
   claim about "what Scripture says" must come from tool output in this session.
   Do not quote a verse from your training data — retrieve it
   (`bible passage`). Do not assert a Greek/Hebrew word's meaning from memory —
   look it up (`bible word`, `bible lemma`). Your training data is the
   hypothesis; the corpus is the evidence.
2. **Plain reading first.** Before analysis, read the passage and its
   surroundings: `bible passage "<ref>" --context 5` (or the whole chapter).
   State what the text plainly says before what it might mean.
3. **Check the words when meaning is load-bearing.** When an argument depends on
   what a word means, examine the actual word: `bible interlinear` for the verse,
   then `bible word <strongs>` for the lexicon range, then
   `bible lemma <strongs> --list` to see its real usage across the canon.
   A word's meaning is its usage pattern, not one gloss.
4. **Compare translations; divergence is signal.** `bible compare "<ref>" -t all`.
   Where translations disagree, an interpretive decision is hiding — go to the
   original (`bible interlinear`, `bible morph`) and name the ambiguity rather
   than silently picking a side.
5. **Trace patterns across the whole canon.** Biblical theology reads Scripture
   as one unfolding story. Use `bible xref --text` for how other passages take
   up this one, `bible freq --strongs X --by-book` for where a theme
   concentrates, `bible cooccur` for what vocabulary clusters together, and
   `bible search --count` to test whether an association is common or rare.
   Patterns you can count are evidence; impressions are not.
6. **Mind the context ladder.** Verse → paragraph → book → testament → canon.
   Never build a claim on a verse without checking the paragraph
   (`--context`), and note when a book's own usage of a word differs from the
   canon-wide pattern (`--book`).
7. **Separate observation from interpretation.** In your output, keep distinct:
   (a) what the text says (with references for every claim),
   (b) what patterns the data shows (with the counts/queries),
   (c) what you infer from it (labeled as inference).
   Do not present inference as text.
8. **Cite so it can be checked.** Every scriptural claim carries its reference.
   Every word-study claim carries the Strong's number. Every pattern claim
   carries the command that produced it, so a human can rerun it.
9. **Report the misses.** If a search shows a cherished connection is absent
   from the text, say so. Negative results are results.

## A worked shape for a study

1. `bible passage` the target text (+context) in 1–2 translations. Observe.
2. `bible compare -t all` — note divergences.
3. `bible interlinear` the key verses; `bible word` the load-bearing terms;
   `bible lemma --list` their canon-wide usage.
4. `bible xref --text`, `bible freq`, `bible cooccur`, `bible search` to trace
   the theme across the canon — both testaments.
5. Synthesize: observations (cited) → patterns (counted) → interpretation
   (labeled). Note what remains ambiguous.
