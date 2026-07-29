import type { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { emit, fail } from '../output.js';

/**
 * The biblical-theology methodology, written for LLM agents. Emitted by
 * `bible agent-setup` as a skill / AGENTS.md section so any harness
 * (Claude Code, Codex, opencode, ...) applies the same discipline.
 */
export const METHODOLOGY = `# Bible study methodology (biblical theology from the text)

You have the \`bible\` CLI: an offline, queryable corpus of Scripture — four English
translations (WEB, KJV, ASV, BSB), the tagged Hebrew OT and Greek NT with
morphology and Strong's numbers, lexicons, an interlinear, 340k ranked
cross-references, and frequency/co-occurrence tools. Every command accepts
--json and is discoverable via --help.

## The rules

1. **Work from the text, not from memory.** Every quotation, word meaning, and
   claim about "what Scripture says" must come from tool output in this session.
   Do not quote a verse from your training data — retrieve it
   (\`bible passage\`). Do not assert a Greek/Hebrew word's meaning from memory —
   look it up (\`bible word\`, \`bible lemma\`). Your training data is the
   hypothesis; the corpus is the evidence.
2. **Plain reading first.** Before analysis, read the passage and its
   surroundings: \`bible passage "<ref>" --context 5\` (or the whole chapter).
   State what the text plainly says before what it might mean.
3. **Check the words when meaning is load-bearing.** When an argument depends on
   what a word means, examine the actual word: \`bible interlinear\` for the verse,
   then \`bible word <strongs>\` for the lexicon range, then
   \`bible lemma <strongs>\` to list its real usage across the canon.
   A word's meaning is its usage pattern, not one gloss.
4. **Compare translations; divergence is signal.** \`bible compare "<ref>" -t all\`.
   Where translations disagree, an interpretive decision is hiding — go to the
   original (\`bible interlinear\`, \`bible morph\`) and name the ambiguity rather
   than silently picking a side.
5. **Trace patterns across the whole canon.** Biblical theology reads Scripture
   as one unfolding story. Use \`bible quotes\` for computed OT-in-NT verbal
   quotations (the canon interpreting itself), \`bible xref --text\` for how
   other passages take up this one, \`bible freq --strongs X --by-book\` for
   where a theme concentrates, \`bible cooccur\` and \`bible similar\` for what
   vocabulary clusters together, and \`bible search --count\` to test whether an
   association is common or rare. Patterns you can count are evidence;
   impressions are not. When a person or place matters, \`bible name\` tells you
   which of the identically-named individuals this is.
6. **Mind the context ladder.** Verse → paragraph → book → testament → canon.
   Never build a claim on a verse without checking the paragraph
   (\`--context\`), and note when a book's own usage of a word differs from the
   canon-wide pattern (\`--book\`).
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

1. \`bible passage\` the target text (+context) in 1–2 translations. Observe.
2. \`bible compare -t all\` — note divergences.
3. \`bible interlinear\` the key verses; \`bible word\` the load-bearing terms;
   \`bible lemma\` their canon-wide usage.
4. \`bible xref --text\`, \`bible freq\`, \`bible cooccur\`, \`bible search\` to trace
   the theme across the canon — both testaments.
5. Synthesize: observations (cited) → patterns (counted) → interpretation
   (labeled). Note what remains ambiguous.
`;

const CLAUDE_SKILL_FRONTMATTER = `---
name: bible-study
description: Disciplined Bible study using the bible CLI — plain reading, original-language word study, cross-translation comparison, and canon-wide pattern analysis, working strictly from the text rather than training data. Use whenever asked to study, explain, or find patterns in Scripture.
---

`;

export function registerAgentCommands(program: Command): void {
  program
    .command('agent-setup')
    .description("Write the study-methodology guidance for an agent harness: claude | codex | opencode | generic")
    .argument('[harness]', 'claude (skill), codex/opencode/generic (AGENTS.md section)', 'generic')
    .option('--dir <path>', 'project directory to write into (default: cwd)')
    .option('--stdout', 'print to stdout instead of writing files')
    .option('--json', 'output JSON')
    .action((harness: string, opts: { dir?: string; stdout?: boolean; json?: boolean }) => {
      const dir = path.resolve(opts.dir ?? process.cwd());
      const written: string[] = [];

      if (opts.stdout) {
        emit(opts, { methodology: METHODOLOGY }, () => METHODOLOGY.trimEnd());
        return;
      }

      switch (harness) {
        case 'claude': {
          const skillDir = path.join(dir, '.claude', 'skills', 'bible-study');
          fs.mkdirSync(skillDir, { recursive: true });
          fs.writeFileSync(path.join(skillDir, 'SKILL.md'), CLAUDE_SKILL_FRONTMATTER + METHODOLOGY);
          written.push(path.join(skillDir, 'SKILL.md'));
          break;
        }
        case 'codex':
        case 'opencode':
        case 'generic': {
          const file = path.join(dir, 'AGENTS.md');
          const marker = '<!-- bible-cli methodology -->';
          const section = `\n${marker}\n${METHODOLOGY}`;
          if (fs.existsSync(file)) {
            const existing = fs.readFileSync(file, 'utf8');
            if (existing.includes(marker)) {
              fail(opts, `${file} already contains the bible-cli methodology section.`);
            }
            fs.appendFileSync(file, section);
          } else {
            fs.writeFileSync(file, `# Agent guidance\n${section}`);
          }
          written.push(file);
          break;
        }
        default:
          fail(opts, `Unknown harness '${harness}'. Options: claude, codex, opencode, generic.`);
      }
      emit(opts, { harness, written }, () => `Wrote:\n${written.map((w) => `  ${w}`).join('\n')}`);
    });
}
