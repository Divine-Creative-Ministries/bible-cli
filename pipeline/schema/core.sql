-- bible-core.db: canon spine, English translations, FTS, cross-references, versification
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

CREATE TABLE books (
  book_num    INTEGER PRIMARY KEY,
  usfm_code   TEXT NOT NULL UNIQUE,
  osis_code   TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  testament   TEXT NOT NULL CHECK (testament IN ('OT','NT')),
  n_chapters  INTEGER NOT NULL
);

CREATE TABLE verses (
  verse_id INTEGER PRIMARY KEY,   -- BBCCCVVV; verse 0 = superscription/title
  book_num INTEGER NOT NULL REFERENCES books(book_num),
  chapter  INTEGER NOT NULL,
  verse    INTEGER NOT NULL
);
CREATE INDEX idx_verses_bc ON verses(book_num, chapter);

CREATE TABLE translations (
  translation_id TEXT PRIMARY KEY,   -- 'WEB','KJV','ASV','BSB'
  name           TEXT NOT NULL,
  language       TEXT NOT NULL DEFAULT 'en',
  source_id      TEXT NOT NULL REFERENCES sources(source_id)
);

CREATE TABLE verse_texts (
  translation_id TEXT    NOT NULL REFERENCES translations(translation_id),
  verse_id       INTEGER NOT NULL REFERENCES verses(verse_id),
  text           TEXT    NOT NULL,
  bridge_end     INTEGER,           -- last verse_id covered when this row is a verse bridge
  PRIMARY KEY (translation_id, verse_id)
) WITHOUT ROWID;
CREATE INDEX idx_vt_verse ON verse_texts(verse_id);

-- Unified FTS over all translations. Exact (unstemmed) primary index.
CREATE VIRTUAL TABLE verse_fts USING fts5(
  text,
  translation_id UNINDEXED,
  verse_id UNINDEXED,
  tokenize = "unicode61 remove_diacritics 2 tokenchars '''-'"
);
-- Stemmed index for recall-oriented search.
CREATE VIRTUAL TABLE verse_fts_stem USING fts5(
  text,
  translation_id UNINDEXED,
  verse_id UNINDEXED,
  tokenize = "porter unicode61 remove_diacritics 2 tokenchars '''-'"
);

CREATE TABLE cross_refs (
  from_verse_id  INTEGER NOT NULL,
  to_verse_start INTEGER NOT NULL,
  to_verse_end   INTEGER NOT NULL,
  votes          INTEGER NOT NULL,
  PRIMARY KEY (from_verse_id, to_verse_start, to_verse_end)
) WITHOUT ROWID;
CREATE INDEX idx_xref_to ON cross_refs(to_verse_start);

-- Native numbering in other traditions mapped onto the spine.
CREATE TABLE versification_map (
  tradition      TEXT NOT NULL,        -- 'Hebrew' | 'Greek'
  book_num       INTEGER NOT NULL,
  chapter        INTEGER NOT NULL,
  verse          INTEGER NOT NULL,
  spine_verse_id INTEGER NOT NULL,
  PRIMARY KEY (tradition, book_num, chapter, verse)
) WITHOUT ROWID;
CREATE INDEX idx_vmap_spine ON versification_map(spine_verse_id, tradition);
