import type { Command } from 'commander';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { emit, fail } from '../output.js';

/**
 * The biblical-theology methodology, written for LLM agents. Emitted by
 * `bible agent-setup` as a skill / AGENTS.md section so any harness
 * (Claude Code, Codex, opencode, ...) applies the same discipline.
 */
export const METHODOLOGY = `# Bible study methodology: the text-first protocol

You have the \`bible\` CLI: an offline, queryable corpus — four English
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
   about meaning, so the evidence must be usage — \`word\`, \`lemma\`,
   \`interlinear\`, \`compare\`, context. A meaning claim without the usage
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

1. **Discovery before thesis.** Open with \`bible survey <topic|word|ref>\` and
   read the corpus's own structure — distributions, top passages,
   cross-references, quotation links — BEFORE writing any interpretive
   sentence. Your outline must come from what the survey surfaced, not from
   memory. Then read the key passages in context (\`passage --context\`,
   \`compare -t all\`) and the load-bearing words by usage (\`word\`, \`lemma\`).
2. **State theses as testable claims.** "H2617 chesed clusters with covenant
   contexts" is testable; "the Bible teaches covenant love" is not yet.
3. **Attempt refutation — mandatory.** For each thesis, run the search that
   would DISPROVE it, and report the result either way: the counter-example
   search, the base rate (\`freq\`, \`search --count\`), the contexts where the
   association fails. A thesis you have not tried to break is not a finding.
4. **Trace the canon's own connections** — \`quotes\` (computed verbal links,
   tiered by confidence), \`xref --text\`, \`cooccur\`, \`similar\` — rather than
   asserting connections from memory. \`name\` disambiguates individuals.
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

## Discipline

- Never quote a verse from memory — retrieve it. Never assert a Greek/Hebrew
  word's meaning from memory — look it up. If you catch yourself writing
  Scripture text that no tool returned this session, stop and retrieve it.
- No pattern claim without its denominator (how often, out of how many).
- Investigation ≠ output: run the full sweep, then write a focused answer.
  The counts and refutation results appear where they carry weight; the rest
  of the sweep informs but does not bloat.
- Costs are one call each: \`survey\` for the dossier, \`freq --by-book\` for a
  distribution, \`search --count\` for a base rate. Thoroughness is cheap here
  by design — use it.
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
    .option('--user', 'install for every session on this machine instead of one project (claude: ~/.claude/skills; codex: ~/.codex/AGENTS.md; opencode: ~/.config/opencode/AGENTS.md)')
    .option('--stdout', 'print to stdout instead of writing files')
    .option('--json', 'output JSON')
    .action((harness: string, opts: { dir?: string; user?: boolean; stdout?: boolean; json?: boolean }) => {
      const home = process.env.BIBLE_CLI_HOME_OVERRIDE ?? os.homedir();
      const written: string[] = [];

      if (opts.stdout) {
        emit(opts, { methodology: METHODOLOGY }, () => METHODOLOGY.trimEnd());
        return;
      }
      if (opts.user && opts.dir) fail(opts, '--user and --dir are mutually exclusive.');
      if (opts.user && harness === 'generic') {
        fail(opts, "--user needs a specific harness so the file lands where that agent reads it: claude, codex, or opencode.");
      }
      const dir = path.resolve(opts.dir ?? process.cwd());

      const appendAgentsMd = (file: string): void => {
        const marker = '<!-- bible-cli methodology -->';
        const section = `\n${marker}\n${METHODOLOGY}`;
        if (fs.existsSync(file)) {
          const existing = fs.readFileSync(file, 'utf8');
          if (existing.includes(marker)) {
            fail(opts, `${file} already contains the bible-cli methodology section.`);
          }
          fs.appendFileSync(file, section);
        } else {
          fs.mkdirSync(path.dirname(file), { recursive: true });
          fs.writeFileSync(file, `# Agent guidance\n${section}`);
        }
        written.push(file);
      };

      switch (harness) {
        case 'claude': {
          const skillDir = opts.user
            ? path.join(home, '.claude', 'skills', 'bible-study')
            : path.join(dir, '.claude', 'skills', 'bible-study');
          fs.mkdirSync(skillDir, { recursive: true });
          fs.writeFileSync(path.join(skillDir, 'SKILL.md'), CLAUDE_SKILL_FRONTMATTER + METHODOLOGY);
          written.push(path.join(skillDir, 'SKILL.md'));
          break;
        }
        case 'codex':
          appendAgentsMd(opts.user ? path.join(home, '.codex', 'AGENTS.md') : path.join(dir, 'AGENTS.md'));
          break;
        case 'opencode':
          appendAgentsMd(opts.user ? path.join(home, '.config', 'opencode', 'AGENTS.md') : path.join(dir, 'AGENTS.md'));
          break;
        case 'generic':
          appendAgentsMd(path.join(dir, 'AGENTS.md'));
          break;
        default:
          fail(opts, `Unknown harness '${harness}'. Options: claude, codex, opencode, generic.`);
      }
      emit(opts, { harness, scope: opts.user ? 'user' : 'project', written }, () => `Wrote:\n${written.map((w) => `  ${w}`).join('\n')}`);
    });
}
