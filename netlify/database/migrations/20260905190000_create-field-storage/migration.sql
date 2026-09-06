CREATE TABLE data_scopes (
  id TEXT PRIMARY KEY,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('personal', 'organization')),
  identity_user_id TEXT UNIQUE,
  organization_id TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (scope_type = 'personal' AND identity_user_id IS NOT NULL AND organization_id IS NULL)
    OR
    (scope_type = 'organization' AND identity_user_id IS NULL AND organization_id IS NOT NULL)
  )
);

CREATE TABLE field_definitions (
  scope_id TEXT NOT NULL REFERENCES data_scopes(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (scope_id, id),
  UNIQUE (scope_id, normalized_name)
);

CREATE TABLE field_runs (
  scope_id TEXT NOT NULL REFERENCES data_scopes(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL,
  field_id TEXT,
  field_name TEXT NOT NULL DEFAULT '',
  started_at_local TEXT NOT NULL DEFAULT '',
  completed_at_local TEXT,
  current_revision INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  PRIMARY KEY (scope_id, run_id),
  FOREIGN KEY (scope_id, field_id)
    REFERENCES field_definitions(scope_id, id)
);

CREATE TABLE field_snapshots (
  scope_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  snapshot_type TEXT NOT NULL CHECK (snapshot_type IN ('autosave', 'manual')),
  client_revision INTEGER NOT NULL DEFAULT 0,
  row_count INTEGER NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  PRIMARY KEY (scope_id, snapshot_id),
  FOREIGN KEY (scope_id, run_id)
    REFERENCES field_runs(scope_id, run_id) ON DELETE CASCADE,
  CHECK (
    (snapshot_type = 'autosave' AND expires_at IS NOT NULL)
    OR
    (snapshot_type = 'manual' AND expires_at IS NULL)
  )
);

CREATE INDEX field_runs_scope_updated_idx
  ON field_runs(scope_id, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX field_snapshots_run_created_idx
  ON field_snapshots(scope_id, run_id, created_at DESC);

CREATE INDEX field_snapshots_expiry_idx
  ON field_snapshots(expires_at)
  WHERE snapshot_type = 'autosave';
