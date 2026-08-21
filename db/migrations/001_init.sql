-- Initial schema.
--
-- One rule is enforced structurally rather than by convention: there is no
-- workers table and no per-person foreign key anywhere. Labour is attributed
-- to a crew. Adding individual attribution would require a migration someone
-- has to write and justify, which is exactly the friction intended.
-- See docs/decisions.md §9.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE trade AS ENUM ('electrical', 'concrete_forming', 'mechanical');

CREATE TYPE unit_of_measure AS ENUM ('LF', 'EA', 'SF', 'CY', 'LB', 'CWT');

CREATE TYPE condition_kind AS ENUM (
  'blocked_access', 'stacked_trades', 'out_of_sequence',
  'incomplete_predecessor', 'damage', 'differing_condition'
);

CREATE TYPE jurisdiction AS ENUM ('BC', 'AB', 'ON', 'SK', 'MB', 'FEDERAL');

CREATE TYPE evidence_purpose AS ENUM ('change_order', 'notice_response', 'adjudication');

-- Tenant boundary. Every query below is org-scoped.
CREATE TABLE orgs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE projects (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  job_number  text NOT NULL,
  name        text NOT NULL,
  started_on  date NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, job_number)
);

-- A line of the bid. The denominator of the productivity ratio.
CREATE TABLE scope_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  trade             trade NOT NULL,
  description       text NOT NULL,
  cost_code         text NOT NULL,
  budgeted_quantity numeric(14,3) NOT NULL CHECK (budgeted_quantity > 0),
  unit              unit_of_measure NOT NULL,
  budgeted_hours    numeric(12,2) NOT NULL CHECK (budgeted_hours > 0),
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX scope_items_project_idx ON scope_items (project_id);

-- The smallest unit of attribution in the system. Not a person.
CREATE TABLE crews (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        text NOT NULL,
  UNIQUE (project_id, name)
);

-- Media, post-blur. blurred_at is NOT NULL because a capture cannot exist
-- in an unblurred state: ingest blurs before the first durable write and
-- discards the original.
CREATE TABLE captures (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  captured_at   timestamptz NOT NULL,
  blurred_at    timestamptz NOT NULL,
  media_key     text NOT NULL UNIQUE,
  area          text,
  geo_lat       double precision,
  geo_lon       double precision,
  geo_accuracy_m real,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX captures_project_captured_idx ON captures (project_id, captured_at DESC);

-- The probabilistic half of the ratio.
CREATE TABLE quantity_observations (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_item_id               uuid NOT NULL REFERENCES scope_items(id) ON DELETE CASCADE,
  observed_on                 date NOT NULL,
  estimated_quantity          numeric(14,3) NOT NULL CHECK (estimated_quantity >= 0),
  unit                        unit_of_measure NOT NULL,
  confidence                  real NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  confidence_band_half_width  numeric(14,3) NOT NULL CHECK (confidence_band_half_width >= 0),
  abstained                   boolean NOT NULL DEFAULT false,
  -- A correction never overwrites the estimate: both are retained, as audit
  -- trail and as training signal.
  corrected_quantity          numeric(14,3) CHECK (corrected_quantity >= 0),
  corrected_at                timestamptz,
  model_version               text NOT NULL,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT correction_is_complete
    CHECK ((corrected_quantity IS NULL) = (corrected_at IS NULL))
);
CREATE INDEX quantity_observations_scope_date_idx
  ON quantity_observations (scope_item_id, observed_on DESC);

-- Provenance: every reported quantity traces to the captures behind it.
CREATE TABLE quantity_observation_captures (
  observation_id uuid NOT NULL REFERENCES quantity_observations(id) ON DELETE CASCADE,
  capture_id     uuid NOT NULL REFERENCES captures(id) ON DELETE RESTRICT,
  PRIMARY KEY (observation_id, capture_id)
);

-- The exact half of the ratio. Crew-attributed, never per-person.
CREATE TABLE labor_days (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scope_item_id uuid NOT NULL REFERENCES scope_items(id) ON DELETE CASCADE,
  crew_id       uuid NOT NULL REFERENCES crews(id) ON DELETE RESTRICT,
  worked_on     date NOT NULL,
  hours         numeric(8,2) NOT NULL CHECK (hours > 0),
  source        text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope_item_id, crew_id, worked_on)
);
CREATE INDEX labor_days_scope_date_idx ON labor_days (scope_item_id, worked_on DESC);

CREATE TABLE site_conditions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scope_item_id uuid REFERENCES scope_items(id) ON DELETE SET NULL,
  kind          condition_kind NOT NULL,
  observed_on   date NOT NULL,
  note          text NOT NULL,
  billable      boolean,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX site_conditions_project_date_idx ON site_conditions (project_id, observed_on DESC);

CREATE TABLE site_condition_captures (
  condition_id uuid NOT NULL REFERENCES site_conditions(id) ON DELETE CASCADE,
  capture_id   uuid NOT NULL REFERENCES captures(id) ON DELETE RESTRICT,
  PRIMARY KEY (condition_id, capture_id)
);

-- A dated assertion about site conditions. Immutable once issued: new
-- versions are new rows. A package that can be quietly edited after the
-- fact is worthless in a dispute.
CREATE TABLE evidence_packages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  purpose       evidence_purpose NOT NULL,
  jurisdiction  jurisdiction NOT NULL,
  version       integer NOT NULL CHECK (version >= 1),
  period_start  date NOT NULL,
  period_end    date NOT NULL,
  issued_at     timestamptz NOT NULL DEFAULT now(),
  document_key  text,
  CHECK (period_end >= period_start),
  UNIQUE (project_id, purpose, period_start, period_end, version)
);
