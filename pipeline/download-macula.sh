#!/usr/bin/env bash
# Fetch the MACULA lowfat treebanks (inputs of pipeline/build-syntax.ts) into
# .cache/raw/macula/ via pinned-commit sparse checkouts — the repos are far too
# large to clone fully (sources/, nodes/, tei/ are not needed).
#
# Also requires the TAHOT/TAGNT files from pipeline/download.sh (used for the
# native-tradition -> spine versification mapping).
#
# Licensing (verified at the pinned commits):
#   macula-hebrew LICENSE.md — CC BY 4.0 (Biblica, Inc); WLC base text
#     unrestricted (tanach.us). SDBH semantic domains are "used with
#     permission" only and are NOT ingested by the syntax stage.
#   macula-greek LICENSE.md — CC BY 4.0 (Biblica, Inc). The SBLGNT stream is
#     used because its base text is CC BY 4.0 (LogosBible/SBLGNT LICENSE);
#     MARBLE @ln/@domain senses are "used with permission" and NOT ingested.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .cache/raw/macula
cd .cache/raw/macula

MACULA_HEBREW_COMMIT="47db250bd55d0d8577f2a94fba114ef16c35b23c"
MACULA_GREEK_COMMIT="8423afe47b9e8f24b7772e808af45c7159a6fe7e"

sparse_fetch() { # sparse_fetch <dir> <repo-url> <commit> <path...>
  local dir="$1" url="$2" commit="$3"
  shift 3
  if [ -e "$dir/.git" ] && git -C "$dir" rev-parse --verify -q "$commit^{commit}" >/dev/null; then
    echo "$dir already at pinned commit"
    return
  fi
  rm -rf "$dir"
  git init -q "$dir"
  git -C "$dir" remote add origin "$url"
  git -C "$dir" sparse-checkout set --no-cone "$@" LICENSE.md
  git -C "$dir" fetch -q --depth 1 --filter=blob:none origin "$commit"
  git -C "$dir" checkout -q "$commit"
}

sparse_fetch hebrew-git https://github.com/Clear-Bible/macula-hebrew.git "$MACULA_HEBREW_COMMIT" WLC/lowfat
sparse_fetch greek-git  https://github.com/Clear-Bible/macula-greek.git  "$MACULA_GREEK_COMMIT" SBLGNT/lowfat

echo "macula lowfat trees ready"
