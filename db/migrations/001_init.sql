-- Initial schema — the entities of technical plan §4 as DDL.
--
-- The non-negotiable constraint from §4 is enforced structurally here rather
-- than by convention: no table, column, or view resolves installed quantity or
-- productivity to an individual worker. `captures.captured_by` is the single
-- reference to a person in the schema, it exists for provenance, and the
-- comment on it says so. Adding per-worker productivity would require a
-- migration someone has to write and justify — which is the intended friction.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE trade AS ENUM ('electrical', 'concrete_forming', 'mechanical');

CREATE TYPE unit_of_measure AS ENUM ('LF', 'EA', 'SF', 'CY', 'LB', 'CWT');

-- Set at ingest, never inferred later. This is what makes the §11 leak test
-- enforceable: 'simulated' may train a model and may never measure one.
CREATE TYPE capture_origin AS ENUM ('field', 'self_measured', 'simulated');

CREATE TYPE face_blur_status AS ENUM ('pending', 'blurred', 'failed');

CREATE TYPE condition_type AS ENUM (
  'blocked_access', 'stacked_trades', 'out_of_sequence',
  'incomplete_predecessor', 'damage', 'differing_condition'
);

CREATE TYPE evidence_package_type AS ENUM ('change_order', 'adjudication_bc', 'adjudication_on');

CREATE TYPE evidence_package_status AS ENUM ('draft', 'issued', 'superseded');

CREATE TYPE alert_severity AS ENUM ('info', 'warning', 'critical');

CREATE TABLE organizations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name  text NOT NULL,
  province    char(2) NOT NULL,
  trades      trade[] NOT NULL DEFAULT '{}',
  -- Canadian residency is a contractual commitment, so it is recorded per
  -- customer rather than assumed globally (business plan §4.3).
  data_region text NOT NULL DEFAULT 'ca-central-1',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE projects (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name        text NOT NULL,
  address     text,
  geo_lat     double precision,
  geo_lon     double precision,
  status      text NOT NULL DEFAULT 'active',
  start_date  date NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX projects_org_idx ON projects (org_id);

-- A bid line. budgeted_units_per_hour is generated rather than stored loose,
-- so the denominator of every factor cannot drift from the bid it came from.
CREATE TABLE scope_items (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id              uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  trade                   trade NOT NULL,
  description             text NOT NULL,
  cost_code               text NOT NULL,
  unit_of_measure         unit_of_measure NOT NULL,
  bid_quantity            numeric(14,3) NOT NULL CHECK (bid_quantity > 0),
  bid_hours               numeric(12,2) NOT NULL CHECK (bid_hours > 0),
  budgeted_units_per_hour numeric(14,6)
    GENERATED ALWAYS AS (bid_quantity / bid_hours) STORED,
  created_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX scope_items_project_idx ON scope_items (project_id);
CREATE INDEX scope_items_cost_code_idx ON scope_items (project_id, cost_code);

-- The smallest unit of attribution for labour. Not a person.
CREATE TABLE crews (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       text NOT NULL,
  UNIQUE (project_id, name)
);

CREATE TABLE captures (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  area             text,
  captured_at      timestamptz NOT NULL,
  captured_by      uuid,
  geo_lat          double precision,
  geo_lon          double precision,
  geo_accuracy_m   real,
  media_ref        text NOT NULL UNIQUE,
  face_blur_status face_blur_status NOT NULL DEFAULT 'pending',
  origin           capture_origin NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN captures.captured_by IS 'Audit and provenance only. Never joined to quantity or hours, never surfaced as a performance metric, and no view may aggregate by it. Technical plan section 4.';
COMMENT ON COLUMN captures.origin IS 'Set at ingest, never inferred later. Held-out measurement sets admit field and self_measured only - see section 11 leak test.';
CREATE INDEX captures_project_captured_idx ON captures (project_id, captured_at DESC);
CREATE INDEX captures_origin_idx ON captures (origin);

CREATE TABLE quantity_estimates (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  capture_id         uuid NOT NULL REFERENCES captures(id) ON DELETE CASCADE,
  scope_item_id      uuid NOT NULL REFERENCES scope_items(id) ON DELETE CASCADE,
  estimated_quantity numeric(14,3) CHECK (estimated_quantity >= 0),
  confidence         real NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  abstained          boolean NOT NULL DEFAULT false,
  model_version      text NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  -- An abstention carries no quantity, and a reported estimate always does.
  -- Abstention is correct behaviour, not a null result (§5.3).
  CONSTRAINT abstention_carries_no_quantity
    CHECK (abstained = (estimated_quantity IS NULL))
);
CREATE INDEX quantity_estimates_scope_idx ON quantity_estimates (scope_item_id, created_at DESC);

-- The training signal. A correction never overwrites the estimate: both are
-- retained, and the weekly count per project is the core quality metric.
CREATE TABLE corrections (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quantity_estimate_id uuid NOT NULL UNIQUE
                       REFERENCES quantity_estimates(id) ON DELETE CASCADE,
  corrected_quantity numeric(14,3) NOT NULL CHECK (corrected_quantity >= 0),
  corrected_by       uuid NOT NULL,
  corrected_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX corrections_corrected_at_idx ON corrections (corrected_at DESC);

-- From timekeeping. Exact, unlike the quantity side of the ratio.
-- Crew-attributed: there is deliberately no worker reference.
CREATE TABLE labour_hours_records (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scope_item_id       uuid REFERENCES scope_items(id) ON DELETE SET NULL,
  crew_id             uuid NOT NULL REFERENCES crews(id) ON DELETE RESTRICT,
  work_date           date NOT NULL,
  hours               numeric(8,2) NOT NULL CHECK (hours > 0),
  source_system       text NOT NULL,
  -- Unmapped cost codes and other dirt are surfaced, never silently joined
  -- into a factor (§11).
  normalization_flags text[] NOT NULL DEFAULT '{}',
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, crew_id, work_date, scope_item_id)
);
CREATE INDEX labour_hours_scope_date_idx ON labour_hours_records (scope_item_id, work_date DESC);
CREATE INDEX labour_hours_unmapped_idx ON labour_hours_records (project_id)
  WHERE scope_item_id IS NULL;

-- Reconciliation output. Derived and recomputed, never hand-edited.
CREATE TABLE productivity_factors (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id         uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scope_item_id      uuid NOT NULL REFERENCES scope_items(id) ON DELETE CASCADE,
  factor_date        date NOT NULL,
  installed_quantity numeric(14,3) NOT NULL CHECK (installed_quantity >= 0),
  hours              numeric(8,2) NOT NULL CHECK (hours > 0),
  budgeted_rate      numeric(14,6) NOT NULL CHECK (budgeted_rate > 0),
  actual_rate        numeric(14,6) NOT NULL CHECK (actual_rate >= 0),
  factor             numeric(10,6) NOT NULL CHECK (factor >= 0),
  computed_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope_item_id, factor_date)
);
CREATE INDEX productivity_factors_project_date_idx
  ON productivity_factors (project_id, factor_date DESC);

CREATE TABLE conditions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  capture_id     uuid NOT NULL REFERENCES captures(id) ON DELETE CASCADE,
  scope_item_id  uuid REFERENCES scope_items(id) ON DELETE SET NULL,
  condition_type condition_type NOT NULL,
  description    text NOT NULL,
  confidence     real CHECK (confidence >= 0 AND confidence <= 1),
  billable       boolean,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX conditions_capture_idx ON conditions (capture_id);

CREATE TABLE alerts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scope_item_id uuid NOT NULL REFERENCES scope_items(id) ON DELETE CASCADE,
  severity      alert_severity NOT NULL,
  message       text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX alerts_project_created_idx ON alerts (project_id, created_at DESC);

CREATE TABLE alert_correlated_conditions (
  alert_id     uuid NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  condition_id uuid NOT NULL REFERENCES conditions(id) ON DELETE CASCADE,
  PRIMARY KEY (alert_id, condition_id)
);

-- A dated assertion about site conditions. Immutable once issued: a new
-- version is a new row, and the old one is marked superseded. A package that
-- can be quietly edited after the fact is worthless in a dispute.
CREATE TABLE evidence_packages (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  package_type      evidence_package_type NOT NULL,
  version           integer NOT NULL CHECK (version >= 1),
  range_start       date NOT NULL,
  range_end         date NOT NULL,
  status            evidence_package_status NOT NULL DEFAULT 'draft',
  generated_pdf_ref text,
  issued_at         timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (range_end >= range_start),
  CONSTRAINT issued_packages_have_a_document
    CHECK (status = 'draft' OR (issued_at IS NOT NULL AND generated_pdf_ref IS NOT NULL)),
  UNIQUE (project_id, package_type, range_start, range_end, version)
);

CREATE TABLE evidence_package_conditions (
  evidence_package_id uuid NOT NULL REFERENCES evidence_packages(id) ON DELETE CASCADE,
  condition_id        uuid NOT NULL REFERENCES conditions(id) ON DELETE RESTRICT,
  PRIMARY KEY (evidence_package_id, condition_id)
);

-- Record that the worker notice was issued. Deliberately holds no personal
-- data about workers — see business plan §4.3.
CREATE TABLE worker_notices (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  version    text NOT NULL,
  issued_at  timestamptz NOT NULL DEFAULT now(),
  posted_at  timestamptz
);
