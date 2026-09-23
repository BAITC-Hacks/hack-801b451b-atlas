CREATE TABLE IF NOT EXISTS datasets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label varchar(120) NOT NULL,
  kind varchar(16) NOT NULL CHECK (kind IN ('synthetic', 'partner')),
  hash varchar(64) NOT NULL,
  seed_key varchar(80) UNIQUE,
  input jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS datasets_created_at_idx ON datasets (created_at DESC);

CREATE TABLE IF NOT EXISTS runs (
  id uuid PRIMARY KEY,
  dataset_id uuid NOT NULL REFERENCES datasets(id),
  dataset_hash varchar(64) NOT NULL,
  warehouse_id varchar(80) NOT NULL,
  category_id varchar(80),
  status varchar(16) NOT NULL CHECK (status IN ('draft', 'approved')),
  revision integer NOT NULL CHECK (revision >= 1),
  run jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS runs_dataset_id_idx ON runs (dataset_id);

CREATE TABLE IF NOT EXISTS run_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES runs(id),
  revision integer NOT NULL CHECK (revision >= 1),
  action varchar(16) NOT NULL CHECK (action IN ('create', 'edit', 'approve')),
  actor text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  details jsonb NOT NULL,
  UNIQUE (run_id, revision)
);
