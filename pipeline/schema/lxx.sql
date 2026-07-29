-- bible-lxx.db: Septuagint (Swete) text + computed OT-in-NT quotation links.
-- NOTE: this artifact is licensed CC BY-SA 4.0 (the Swete digitization's
-- license) and is therefore distributed separately from core/study.
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

-- LXX text, verse per row, in native LXX numbering.
CREATE TABLE lxx_verses (
  book_num  INTEGER NOT NULL,     -- canonical 66-book number of the counterpart book
  chapter   INTEGER NOT NULL,     -- native LXX numbering
  verse     INTEGER NOT NULL,
  text      TEXT NOT NULL,        -- accented Greek
  text_norm TEXT NOT NULL,        -- normalized (lowercase, unaccented)
  spine_verse_id INTEGER,         -- best-effort mapping to the English spine; NULL if unmapped
  PRIMARY KEY (book_num, chapter, verse)
) WITHOUT ROWID;
CREATE INDEX idx_lxx_spine ON lxx_verses(spine_verse_id);

-- Computed verbal parallels between NT verses (TAGNT default stream) and LXX
-- verses, in three confidence tiers:
--   'quotation' — contiguous run of >= 5 identical normalized words
--   'allusion'  — exact 4-word run containing at least one non-formulaic word
--   'echo'      — no contiguous run, but >= 2 shared rare vocabulary items
CREATE TABLE nt_quotations (
  nt_verse_id      INTEGER NOT NULL,  -- spine id of the NT verse
  lxx_book_num     INTEGER NOT NULL,
  lxx_chapter      INTEGER NOT NULL,
  lxx_verse        INTEGER NOT NULL,
  spine_ot_verse_id INTEGER,          -- spine id of the OT verse (via lxx_verses mapping)
  tier             TEXT NOT NULL,     -- 'quotation' | 'allusion' | 'echo'
  run_len          INTEGER NOT NULL,  -- longest shared word run (0 for echoes)
  shared_rare      INTEGER NOT NULL DEFAULT 0, -- distinct shared rare words (echo evidence)
  shared_text      TEXT NOT NULL,     -- the shared run, or the shared rare words
  PRIMARY KEY (nt_verse_id, lxx_book_num, lxx_chapter, lxx_verse)
) WITHOUT ROWID;
CREATE INDEX idx_quot_ot ON nt_quotations(spine_ot_verse_id);
CREATE INDEX idx_quot_tier ON nt_quotations(tier, run_len);
