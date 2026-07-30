-- bible-syntax.db: clause-level syntax ("who did what to whom") from the
-- MACULA treebanks (Clear-Bible). Hebrew/Aramaic clauses come from the
-- macula-hebrew WLC lowfat trees; Greek clauses from the macula-greek SBLGNT
-- lowfat trees. Both datasets are CC BY 4.0 (Biblica, Inc); the SBLGNT base
-- text is CC BY 4.0 (Logos Bible Software / SBL); the WLC base text is
-- unrestricted (tanach.us). Semantic-domain fields that are only
-- "used with permission" upstream (SDBH, MARBLE @ln/@domain) are deliberately
-- NOT ingested — this artifact ships role structure, lemmas, and Strong's only.
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

-- One row per clause node (wg class="cl") in the lowfat trees. Clauses nest:
-- parent_clause_id points at the enclosing clause (NULL at sentence top level).
CREATE TABLE clauses (
  clause_id        INTEGER PRIMARY KEY,
  verse_start      INTEGER NOT NULL,  -- spine BBCCCVVV of first word (incl. embedded clauses)
  verse_end        INTEGER NOT NULL,  -- spine BBCCCVVV of last word
  lang             TEXT NOT NULL,     -- 'H' | 'A' | 'G'
  kind             TEXT,              -- upstream clauseType (e.g. 'nominalized') when present
  rule             TEXT,              -- constituent-order rule, e.g. 'PP-V-S-O', 'P-VC-S'
  parent_clause_id INTEGER,           -- enclosing clause, NULL for top-level
  negated          INTEGER NOT NULL DEFAULT 0, -- clause contains a tree-marked negator
  speaker          TEXT               -- reserved: MACULA lowfat carries no who-said data (unpopulated)
);
CREATE INDEX idx_clauses_verse ON clauses(verse_start);

-- One row per word (morpheme, for Hebrew) inside a role slot of a clause.
-- When a whole clause fills a role slot (participial subjects, object/quote
-- clauses), its words are ALSO recorded on the enclosing clause under that
-- role with embedded=1, so subject/object searches match clausal constituents.
-- role vocabulary: s (subject), v (verb), vc (verbal copula), o (object),
-- o2 (second object), io (indirect object), p (non-verbal predicate),
-- pp (prepositional phrase), adv (adverbial), aux (auxiliary).
-- Rare upstream multi-word Strong's values ('1886a|0725', '1537+4053';
-- 18 words in the pinned corpus) keep only their first component.
CREATE TABLE clause_roles (
  clause_id   INTEGER NOT NULL REFERENCES clauses(clause_id),
  role        TEXT NOT NULL,
  verse_id    INTEGER NOT NULL,      -- spine BBCCCVVV
  word_pos    INTEGER NOT NULL,      -- word number within the source verse
  surface     TEXT NOT NULL,
  lemma       TEXT,
  lemma_norm  TEXT,                  -- pointing-stripped Hebrew / folded lowercase Greek
  strongs     TEXT,                  -- 'H0430', 'G4100', incl. dStrong suffix when upstream has one
  strongs_num INTEGER,
  embedded    INTEGER NOT NULL DEFAULT 0, -- 1 = word of an embedded clause filling this slot
  negated     INTEGER NOT NULL DEFAULT 0  -- set on own (embedded=0) v/vc rows of negated clauses
);
CREATE INDEX idx_roles_strongs ON clause_roles(strongs_num, role);
CREATE INDEX idx_roles_lemma ON clause_roles(lemma_norm, role);
CREATE INDEX idx_roles_clause ON clause_roles(clause_id);
