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

## Native driver policy
- better-sqlite3 v13 bundles prebuilds that need glibc >= 2.38 on some
  platforms and can hard-crash (SIGSEGV) where incompatible — it took the CLI
  down inside ChatGPT/Codex sandboxes. `src/db/driver.ts` probes candidate
  drivers in a child process and falls back to the `better-sqlite3-v12`
  optionalDependency. Never import better-sqlite3 directly in src/ (only via
  loadDriver()), never drop the optionalDependency, and keep the
  compat-smoke CI job (old-glibc containers) green.

## Release rules
- Data releases: ALWAYS use `scripts/release-data.sh` (regenerates every gzip
  + manifest). Never hand-gzip: gzip preserves input mtimes and skipping
  "existing" gzips shipped stale artifacts once (data-v0.1.2). And after
  running it, upload ALL artifacts + manifest + SHA256SUMS together — a
  partial `gh release upload` (subset of gzips with a regenerated manifest)
  broke data-v0.2.0's core checksum once; the release must always be
  internally consistent.
- npm releases are remote: bump version + DATA_VERSION if data changed, push,
  then push tag `vX.Y.Z` — CI publishes via npm Trusted Publishing (OIDC).
  After a release, nudge the landing docs sync:
  `gh workflow run sync-docs.yml -R Divine-Creative-Ministries/bible-cli-landing-page`
- `npm run gen-docs` regenerates docs/ + README command table from the CLI
  itself; CI (docs.yml) auto-commits drift on push to main.

## Workflows
- Full rebuild: `bash pipeline/download.sh && npm run pipeline`
- Dev CLI: `npx tsx src/cli.ts <cmd>` (uses `data/dist/` automatically)
- Ship build: `npm run build` then `node dist/cli.js ...`
- MCP requires the built dist (it re-invokes its own entry with --json).
