---
name: bible-study
description: Evidence-based Bible study with the Bible CLI tools. Reads passages, runs Greek and Hebrew word studies, compares translations, traces cross-references and quotations, and tests patterns across the canon, working from retrieved text. Use when someone asks to study, explain, or find patterns in Scripture, or asks what a biblical word or passage means.
---

# Bible study with the Bible CLI tools

These tools answer from a fixed corpus: four English translations (BSB, WEB, KJV,
ASV), the tagged Hebrew Old Testament and Greek New Testament with morphology,
clause-level syntax, lexicons, ranked cross-references, computed quotation links
and parallels, and printed-edition variants. The aim is simple: every claim in an
answer can be traced to a tool result.

This guide is the short form. `get_methodology` returns the full text, which uses
the command-line names (`word`, `freq`, `xref`, `quotes`, `similar`, `cooccur`,
`name`, `grep-morph`, `syntax`). The table below gives the matching tool for each.

## Two working rules

**Evidence flows from text to conclusion.** Background knowledge can suggest a
hypothesis, and the corpus settles it. Watch for the opposite order: recalling a
conclusion, then looking for verses that support it.

**Reading comes first, and queries test what reading surfaced.** Depth comes from
reading whole chapters and books rather than joining search hits. The deeper the
question, the more to read before querying. A whole book takes only a handful of
`read` calls.

## Match the tool to the question

| Question | Tools |
| --- | --- |
| What does the text say? | `passage`, `read`, `outline` |
| Where does an English word or phrase occur? | `search` |
| What does a word mean? | `word_study`, `lemma`, `interlinear`, `original`, `morph`, `frequency` |
| Which words have this grammatical form? | `morph_search` |
| Who did what to whom? | `syntax_search` |
| Where do translations diverge? | `compare` |
| What is the textual evidence? | `variants` |
| How does the canon connect to a passage? | `cross_references`, `quotations`, `parallels`, `similar_passages`, `cooccurrence` |
| Who or what is this name? | `name_lookup` |
| Is this repeated phrasing a real formula? | `pattern` |
| What does the corpus hold on this topic? | `survey` |
| How is a reference normalized? How is the data organized? | `parse_reference`, `schema` |

`syntax_search` is for grammatical claims. For example, "God remembers" is subject
H430 with verb H2142, a stronger test than finding both words near each other.

The hosted server is read-only. It has no raw SQL tool and no study-session
notebook, so keep observations and open questions in the conversation.

## Match the evidence to the claim

1. **Lookup** (what does X say, where is Y): retrieve and answer. One or two calls
   is fully rigorous. Quote what was retrieved and claim nothing beyond it.
2. **Word or passage** (what does X mean, how does Y work): the evidence is usage
   and context. Use `word_study`, `lemma`, `interlinear`, and `compare`, then read
   the whole literary unit with `read`, not only the verse.
3. **Study** (a theme, a pattern, a theology of something, or any claim that
   generalizes across the canon): follow the workflow below, cover both testaments,
   and report what did not turn up.

Move to a higher level when translations diverge at the key phrase, the argument
leans on a theologically loaded term, the draft makes a universal claim, the claim
crosses testaments, or the conclusion was already in mind before the search began.

## Study workflow

1. **Survey first.** Call `survey` on the topic, word, or reference, and read the
   distributions, top passages, and connections before writing any interpretation.
   Let the outline come from what the survey shows.
2. **Read before searching.** Use `outline` for a book's shape, then `read` through
   it chunk by chunk, noting what the text emphasizes. Read the key passages from
   the survey in full context, and study the load-bearing words by usage. Targeted
   queries then test what the reading suggested.
3. **State theses as testable claims.** "H2617 clusters with covenant contexts" can
   be tested; "the Bible teaches covenant love" cannot yet. Test grammatical claims
   with `syntax_search` and formulas with `pattern`, including its observed and
   expected counts.
4. **Try to refute each thesis.** Run the search that would disprove it and report
   the result either way: counterexamples, base rates from `frequency` or `search`
   with `count`, and the contexts where the association fails. A thesis that has
   not been tested against counterevidence is not yet a finding.
5. **Trace the canon's own connections.** Use `quotations`, `parallels`,
   `cross_references`, `cooccurrence`, and `similar_passages` rather than asserting
   links from memory. When wording carries the argument, check `variants`, because
   an edition-disputed word should not carry weight without saying so.
6. **Synthesize with labeled provenance.** Keep three labels distinct:
   - **OBSERVED:** what the text says, with a reference for each claim.
   - **PATTERN:** what the data shows, with the count and the tool call behind it.
   - **INFERENCE:** the conclusion, argued only from the two above.

   Label anything from outside the corpus (commentary, historical background,
   recall) as interpretive tradition, not established from this corpus.
7. **Give the alternative its strongest form.** State the best competing reading and
   which results decide between them, or say that the text leaves it open.
8. **Report the misses.** If the corpus does not support an expected connection, say
   so plainly. Negative results are results.

## Habits that keep a study sound

- Quote Scripture from tool results where you can, and look up a word's meaning
  rather than recalling it.
- Give every pattern claim its denominator: how often, out of how many.
- Read the surrounding chapter before explaining a passage.
- Treat `variants` as printed-edition evidence, not a manuscript apparatus, and
  `quotations` and `parallels` as computed links in labeled confidence tiers.
- Keep the investigation and the answer separate. Run the full sweep, then write a
  focused answer in which counts and refutation results appear where they matter.
