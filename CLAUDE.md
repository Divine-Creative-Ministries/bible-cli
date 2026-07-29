# Bible CLI — repo guide for agents

TypeScript CLI (`bible`) + MCP server over two prebuilt SQLite databases of
open-licensed Scripture data. Node >= 20, ESM, better-sqlite3.

## Layout
- `src/` — runtime CLI. `cli.ts` (commander wiring), `commands/*` (one module
  per command group), `refparse/` (forgiving reference parser), `canon.ts`
  (66-book canon + BBCCCVVV verse-id helpers), `db/` (open/attach/download),
  `mcp/server.ts` (MCP wraps the CLI's own --json interface).
- `pipeline/` — build-time only, run with tsx; not shipped in the npm package.
  `download.sh` fetches raw sources to `.cache/raw/`; `build.ts` orchestrates
  stages -> `data/dist/bible-core.db` + `bible-study.db`; `stages/verify.ts`
  is the invariant gate (verse counts, versification fixtures, morph coverage) —
  builds fail loudly on data problems. Never weaken a verify check to make a
  build pass; fix the stage.
- `test/` — vitest. `npm test`, `npm run typecheck`.

## Key invariants
- Verse ids are `book*1e6 + chapter*1e3 + verse`; verse 0 = Psalm-title
  superscription. The spine is the union of ingested translations (KJV
  numbering base); TAHOT/TAGNT alternate refs map onto it at build time.
- `words` has one row per morpheme; analytics must filter `is_default = 1`
  (Qere, NA-stream Greek) to avoid double counting.
- Data licensing is deliberate: public domain + CC BY + CC0 only. Do not add
  CC BY-SA or unlicensed sources without explicit maintainer sign-off
  (that includes openscriptures Strong's JSON — its conversion is CC-BY-SA).

## Workflows
- Full rebuild: `bash pipeline/download.sh && npm run pipeline`
- Dev CLI: `npx tsx src/cli.ts <cmd>` (uses `data/dist/` automatically)
- Ship build: `npm run build` then `node dist/cli.js ...`
- MCP requires the built dist (it re-invokes its own entry with --json).
