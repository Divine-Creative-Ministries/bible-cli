#!/usr/bin/env bash
# Download all raw data sources into .cache/raw/. Idempotent: skips files that
# already exist. Licenses per source are recorded in pipeline/build.ts and
# baked into the built databases (see `bible licenses`).
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .cache/raw/{ebible,berean,stepbible,dodson,openbible}
cd .cache/raw

SB="https://raw.githubusercontent.com/STEPBible/STEPBible-Data/master"
AMAL="Translators%20Amalgamated%20OT%2BNT"

get() { # get <dest> <url>
  if [ ! -s "$1" ]; then
    echo "fetching $1"
    curl -fsSL --retry 3 -o "$1" "$2"
  fi
}

get ebible/eng-web_usfm.zip     "https://ebible.org/Scriptures/eng-web_usfm.zip" &
get ebible/eng-kjv2006_usfm.zip "https://ebible.org/Scriptures/eng-kjv2006_usfm.zip" &
get ebible/eng-asv_usfm.zip     "https://ebible.org/Scriptures/eng-asv_usfm.zip" &
get berean/bsb.txt              "https://bereanbible.com/bsb.txt" &
get berean/bsb_tables.tsv       "https://bereanbible.com/bsb_tables.tsv" &
get openbible/cross-references.zip "https://a.openbible.info/data/cross-references.zip" &
get dodson/dodson.csv "https://raw.githubusercontent.com/biblicalhumanities/Dodson-Greek-Lexicon/master/dodson.csv" &
wait

get stepbible/TAHOT-1.txt "$SB/$AMAL/TAHOT%20Gen-Deu%20-%20Translators%20Amalgamated%20Hebrew%20OT%20-%20STEPBible.org%20CC%20BY.txt" &
get stepbible/TAHOT-2.txt "$SB/$AMAL/TAHOT%20Jos-Est%20-%20Translators%20Amalgamated%20Hebrew%20OT%20-%20STEPBible.org%20CC%20BY.txt" &
get stepbible/TAHOT-3.txt "$SB/$AMAL/TAHOT%20Job-Sng%20-%20Translators%20Amalgamated%20Hebrew%20OT%20-%20STEPBible.org%20CC%20BY.txt" &
get stepbible/TAHOT-4.txt "$SB/$AMAL/TAHOT%20Isa-Mal%20-%20Translators%20Amalgamated%20Hebrew%20OT%20-%20STEPBible.org%20CC%20BY.txt" &
get stepbible/TAGNT-1.txt "$SB/$AMAL/TAGNT%20Mat-Jhn%20-%20Translators%20Amalgamated%20Greek%20NT%20-%20STEPBible.org%20CC-BY.txt" &
get stepbible/TAGNT-2.txt "$SB/$AMAL/TAGNT%20Act-Rev%20-%20Translators%20Amalgamated%20Greek%20NT%20-%20STEPBible.org%20CC-BY.txt" &
wait

get stepbible/TBESH.txt "$SB/Lexicons/TBESH%20-%20Translators%20Brief%20lexicon%20of%20Extended%20Strongs%20for%20Hebrew%20-%20STEPBible.org%20CC%20BY.txt" &
get stepbible/TBESG.txt "$SB/Lexicons/TBESG%20-%20Translators%20Brief%20lexicon%20of%20Extended%20Strongs%20for%20Greek%20-%20STEPBible.org%20CC%20BY.txt" &
get stepbible/TEHMC.txt "$SB/Morphology%20codes/TEHMC%20-%20Translators%20Expansion%20of%20Hebrew%20Morphology%20Codes%20-%20STEPBible.org%20CC%20BY.txt" &
get stepbible/TEGMC.txt "$SB/Morphology%20codes/TEGMC%20-%20Translators%20Expansion%20of%20Greek%20Morphhology%20Codes%20-%20STEPBible.org%20CC%20BY.txt" &
get stepbible/TVTMS.txt "$SB/Versification/TVTMS%20-%20Translators%20Versification%20Traditions%20with%20Methodology%20for%20Standardisation%20for%20Eng%2BHeb%2BLat%2BGrk%2BOthers%20-%20STEPBible.org%20CC%20BY.txt" &
wait

for z in ebible/*.zip; do
  d="${z%.zip}"
  [ -d "$d" ] || (mkdir -p "$d" && unzip -oq "$z" -d "$d")
done
[ -f openbible/cross_references.txt ] || (cd openbible && unzip -oq cross-references.zip)

echo "all sources ready"
