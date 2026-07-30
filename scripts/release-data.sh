#!/usr/bin/env bash
# Package the data artifacts for a release. ALWAYS regenerates every gzip and
# the manifest from the current .db files — data-v0.1.2 shipped stale study/core
# artifacts because an ad-hoc release skipped existing gzips. Never again.
set -euo pipefail
cd "$(dirname "$0")/../data/dist"
for f in bible-core.db bible-study.db bible-lxx.db; do
  [ -f "$f" ] || { echo "missing $f — run the pipeline first" >&2; exit 1; }
  rm -f "$f.gz"
  gzip -9 -k "$f"
done
node -e '
const fs=require("fs"),crypto=require("crypto");const files={};
for (const f of ["bible-core.db.gz","bible-study.db.gz","bible-lxx.db.gz"]) {
  const buf=fs.readFileSync(f);
  files[f]={sha256:crypto.createHash("sha256").update(buf).digest("hex"),bytes:buf.length};
}
fs.writeFileSync("manifest.json",JSON.stringify({schema_version:"1",files},null,2));
'
shasum -a 256 *.gz > SHA256SUMS
echo "artifacts packaged:"
ls -la *.gz manifest.json
