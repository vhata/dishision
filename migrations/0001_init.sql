CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  owner_id TEXT,
  zip_label TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  prefs TEXT NOT NULL,
  asked TEXT NOT NULL,
  round2_asked INTEGER NOT NULL DEFAULT 0,
  rejected_item_ids TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'asking',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE restaurants (
  place_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  lat REAL, lng REAL,
  primary_type TEXT,
  types TEXT,
  rating REAL,
  user_rating_count INTEGER,
  price_level INTEGER,
  website_uri TEXT,
  maps_uri TEXT,
  hours TEXT,
  delivery INTEGER,
  details_level TEXT NOT NULL DEFAULT 'search',
  fetched_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE menu_sources (
  id TEXT PRIMARY KEY,
  place_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  ref TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  text_hash TEXT,
  text TEXT,
  error TEXT,
  fetched_at TEXT,
  expires_at TEXT
);
CREATE INDEX menu_sources_place ON menu_sources(place_id);

CREATE TABLE menu_items (
  id TEXT PRIMARY KEY,
  place_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  price_cents INTEGER,
  section TEXT,
  position INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX menu_items_place ON menu_items(place_id);

CREATE TABLE menu_item_attributes (
  item_id TEXT PRIMARY KEY,
  tagger TEXT NOT NULL,
  model TEXT,
  prompt_version INTEGER,
  tags TEXT NOT NULL,
  scores TEXT NOT NULL,
  confidence REAL NOT NULL,
  classified_at TEXT NOT NULL
);

CREATE TABLE llm_cache (
  key TEXT PRIMARY KEY,
  model TEXT NOT NULL,
  prompt_version INTEGER NOT NULL,
  output TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE search_cache (
  key TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  response TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE ingest_jobs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  place_id TEXT,
  session_id TEXT,
  payload TEXT NOT NULL DEFAULT '{}',
  priority INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  run_after TEXT NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX ingest_jobs_due ON ingest_jobs(status, run_after, priority);

CREATE TABLE recommendations (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  trace TEXT NOT NULL,
  feedback_reason TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX recommendations_session ON recommendations(session_id);

CREATE TABLE suggestions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  text TEXT NOT NULL,
  prefs_snapshot TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  reviewed_at TEXT
);

CREATE TABLE kb_additions (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  node_id TEXT,
  kb_schema_version INTEGER NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE api_usage (
  day TEXT NOT NULL,
  sku TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, sku)
);
