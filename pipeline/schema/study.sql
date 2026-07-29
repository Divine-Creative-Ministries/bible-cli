-- bible-study.db: original-language words, interlinear, lexicons
PRAGMA journal_mode = WAL;
PRAGMA page_size = 4096;

CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE sources (
  source_id    TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  url          TEXT NOT NULL,
  version      TEXT,
  retrieved_at TEXT NOT NULL,
  license      TEXT NOT NULL,
  license_url  TEXT,
  attribution  TEXT NOT NULL
);

-- One row per morpheme (Hebrew prefixes/suffixes are separate rows sharing word_num).
CREATE TABLE words (
  word_id      INTEGER PRIMARY KEY,
  verse_id     INTEGER NOT NULL,          -- spine id (English versification)
  word_num     INTEGER NOT NULL,          -- word slot within verse, source order
  part_num     INTEGER NOT NULL DEFAULT 1,
  lang         TEXT NOT NULL CHECK (lang IN ('H','A','G')),
  surface      TEXT NOT NULL,
  surface_norm TEXT NOT NULL,
  translit     TEXT,
  lemma        TEXT,
  lemma_norm   TEXT,
  strongs      TEXT,                      -- extended: 'H7225G', 'H9003', 'G0976'
  strongs_num  INTEGER,
  strongs_suffix TEXT,
  gloss        TEXT,
  morph_raw    TEXT,
  morph_scheme TEXT,                      -- 'oshm' | 'robinson'
  pos     TEXT,
  person  TEXT,
  gender  TEXT,
  number_ TEXT,
  gcase   TEXT,
  tense   TEXT,
  voice   TEXT,
  mood    TEXT,
  stem    TEXT,
  state   TEXT,
  degree  TEXT,
  text_type TEXT,                         -- Hebrew: 'L','Q','K','R','X'; Greek: 'N','K','O' combos
  editions  INTEGER NOT NULL DEFAULT 0,   -- Greek edition bitmask; 0 for Hebrew
  is_default INTEGER NOT NULL DEFAULT 1   -- in the default reading stream (Qere; NA-stream Greek)
);
CREATE INDEX idx_words_verse   ON words(verse_id, word_num, part_num);
-- text_type values: Hebrew L/Q/K/R/X streams; Greek word-type letters (NKO
-- combinations) for base rows and 'variant' for apparatus substitution rows.
CREATE INDEX idx_words_strongs ON words(strongs_num, strongs_suffix, verse_id);
CREATE INDEX idx_words_lemma   ON words(lemma_norm, verse_id);
CREATE INDEX idx_words_surface ON words(surface_norm);
CREATE INDEX idx_words_morph_raw ON words(morph_raw);
CREATE INDEX idx_words_morph   ON words(lang, pos, stem, tense, mood, voice);

CREATE TABLE lexicons (
  lexicon_id TEXT PRIMARY KEY,            -- 'strongs','tbesh','tbesg','dodson'
  title      TEXT NOT NULL,
  lang       TEXT NOT NULL,               -- 'H','G','HG'
  source_id  TEXT NOT NULL REFERENCES sources(source_id)
);

CREATE TABLE lexicon_entries (
  lexicon_id  TEXT NOT NULL,
  strongs     TEXT NOT NULL,              -- extended form: 'H1234a','G0026'
  strongs_num INTEGER NOT NULL,
  lemma       TEXT,
  translit    TEXT,
  pos         TEXT,
  short_gloss TEXT,
  definition  TEXT,
  PRIMARY KEY (lexicon_id, strongs)
) WITHOUT ROWID;
CREATE INDEX idx_lex_num ON lexicon_entries(strongs_num);

CREATE TABLE lexicon_links (
  strongs TEXT NOT NULL,
  rel     TEXT NOT NULL,                  -- 'derives_from','see_also'
  target  TEXT NOT NULL,
  PRIMARY KEY (strongs, rel, target)
) WITHOUT ROWID;

CREATE VIRTUAL TABLE lexicon_fts USING fts5(
  short_gloss, definition,
  lexicon_id UNINDEXED, strongs UNINDEXED,
  tokenize = "porter unicode61 remove_diacritics 2"
);

-- Proper nouns: individualised persons/places from STEPBible TIPNR.
CREATE TABLE names (
  name_id      INTEGER PRIMARY KEY,
  kind         TEXT NOT NULL,          -- 'person' | 'place' | 'other'
  unique_name  TEXT NOT NULL,          -- 'Aaron@Exo.4.14-Heb' (disambiguated id)
  display_name TEXT NOT NULL,          -- 'Aaron'
  ustrong      TEXT,                   -- unifying Strong's for the individual
  description  TEXT,                   -- brief description
  summary      TEXT,                   -- one-sentence summary
  meta         TEXT                    -- source top-line description
);
CREATE INDEX idx_names_display ON names(display_name COLLATE NOCASE);

CREATE TABLE name_strongs (
  name_id INTEGER NOT NULL,
  strongs TEXT NOT NULL,               -- dStrong identifying this individual in words
  PRIMARY KEY (name_id, strongs)
) WITHOUT ROWID;
CREATE INDEX idx_ns_strongs ON name_strongs(strongs);
