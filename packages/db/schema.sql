-- SiteWireAi schema.
--
-- Derived from apps/dashboard/src/types.ts, with one structural change: every
-- table carries org_id, including the four that currently scope only by join
-- (quantity_estimates and conditions reach a project through capture_id).
--
-- That denormalisation is deliberate. It makes tenant filtering a WHERE clause
-- on the table being read rather than an argument about whether a join chain
-- happens to be scoped correctly. A query that forgets org_id returns another
-- tenant's rows; a query that forgets a join returns nothing. The first failure
-- is silent and catastrophic, the second is loud and harmless, so the schema is
-- shaped to make the loud one more likely.
--
-- Productivity factors and alerts are NOT stored. They are derived per request
-- by reconcile() and detectDrift() from the rows below, and persisting them
-- would create a second source of truth that drifts from the first.

CREATE TABLE IF NOT EXISTS organizations (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
  id           TEXT PRIMARY KEY,
  org_id       TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  address      TEXT NOT NULL DEFAULT '',
  province     TEXT NOT NULL DEFAULT '',
  data_region  TEXT NOT NULL DEFAULT 'ca-central-1'
);
CREATE INDEX IF NOT EXISTS projects_org ON projects (org_id);

CREATE TABLE IF NOT EXISTS scope_items (
  id                       TEXT PRIMARY KEY,
  org_id                   TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id               TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  trade                    TEXT NOT NULL,
  description              TEXT NOT NULL DEFAULT '',
  unit_of_measure          TEXT NOT NULL DEFAULT '',
  bid_quantity             DOUBLE PRECISION NOT NULL DEFAULT 0,
  budgeted_units_per_hour  DOUBLE PRECISION NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS scope_items_org_project ON scope_items (org_id, project_id);

CREATE TABLE IF NOT EXISTS captures (
  id           TEXT PRIMARY KEY,
  org_id       TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  area         TEXT NOT NULL DEFAULT '',
  captured_at  TEXT NOT NULL,
  -- Provenance only. Business plan §4.3 forbids a per-worker productivity view,
  -- so this is never a GROUP BY key. There is no index on it, on purpose.
  captured_by  TEXT NOT NULL DEFAULT '',
  origin       TEXT NOT NULL,
  -- S3 key for the stored image. Null for seeded rows that have no photograph.
  image_key    TEXT,
  -- The classifier's reading, stored whole rather than shredded into columns:
  -- its shape belongs to the model contract and will change faster than this
  -- schema should.
  classification JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS captures_org_project ON captures (org_id, project_id);

CREATE TABLE IF NOT EXISTS quantity_estimates (
  id                 TEXT PRIMARY KEY,
  org_id             TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  capture_id         TEXT NOT NULL REFERENCES captures(id) ON DELETE CASCADE,
  scope_item_id      TEXT NOT NULL REFERENCES scope_items(id) ON DELETE CASCADE,
  estimated_quantity DOUBLE PRECISION,
  confidence         DOUBLE PRECISION NOT NULL DEFAULT 0,
  -- An abstention is signal, not a gap: a photo nobody can measure is exactly
  -- what teaches the model when to decline.
  abstained          BOOLEAN NOT NULL DEFAULT false,
  model_version      TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS quantity_estimates_org ON quantity_estimates (org_id);
CREATE INDEX IF NOT EXISTS quantity_estimates_scope ON quantity_estimates (org_id, scope_item_id);

CREATE TABLE IF NOT EXISTS labour_hours (
  id                  TEXT PRIMARY KEY,
  org_id              TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id          TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  -- Nullable on purpose. Hours arriving under a cost code nobody has mapped are
  -- held back rather than guessed at, and the data-quality page reports them.
  scope_item_id       TEXT REFERENCES scope_items(id) ON DELETE SET NULL,
  date                TEXT NOT NULL,
  hours               DOUBLE PRECISION NOT NULL DEFAULT 0,
  source_system       TEXT NOT NULL DEFAULT '',
  normalization_flags TEXT[] NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS labour_hours_org_project ON labour_hours (org_id, project_id);

CREATE TABLE IF NOT EXISTS conditions (
  id             TEXT PRIMARY KEY,
  org_id         TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  capture_id     TEXT NOT NULL REFERENCES captures(id) ON DELETE CASCADE,
  condition_type TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  confidence     DOUBLE PRECISION NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS conditions_org ON conditions (org_id);
