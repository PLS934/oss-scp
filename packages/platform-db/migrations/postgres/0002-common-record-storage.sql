CREATE TABLE platform_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plugin_id varchar(255) NOT NULL,
  data_type varchar(255) NOT NULL,
  source_id varchar(255) NOT NULL,
  external_key_type varchar(16) NOT NULL CHECK (external_key_type IN ('string', 'number')),
  external_key varchar(2048) NOT NULL,
  source_values jsonb NOT NULL CHECK (jsonb_typeof(source_values) = 'object'),
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_records_scope_key_unique UNIQUE (plugin_id, data_type, source_id, external_key_type, external_key)
);

CREATE INDEX platform_records_scope_index ON platform_records(plugin_id, source_id, data_type);

CREATE TABLE platform_record_relations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plugin_id varchar(255) NOT NULL,
  source_id varchar(255) NOT NULL,
  relation_type varchar(255) NOT NULL,
  from_record_id uuid NOT NULL REFERENCES platform_records(id) ON DELETE RESTRICT,
  to_record_id uuid NOT NULL REFERENCES platform_records(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_record_relations_unique UNIQUE (relation_type, from_record_id, to_record_id)
);

CREATE INDEX platform_record_relations_scope_index ON platform_record_relations(plugin_id, source_id, relation_type);
CREATE INDEX platform_record_relations_from_index ON platform_record_relations(from_record_id);
CREATE INDEX platform_record_relations_to_index ON platform_record_relations(to_record_id);

CREATE TABLE collection_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plugin_id varchar(255) NOT NULL,
  source_id varchar(255) NOT NULL,
  scope_type varchar(16) NOT NULL CHECK (scope_type IN ('full', 'asset')),
  scope_key varchar(255) NOT NULL,
  config_revision varchar(255) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'partial', 'failed')),
  processed_count bigint NOT NULL DEFAULT 0 CHECK (processed_count >= 0),
  accepted_count bigint NOT NULL DEFAULT 0 CHECK (accepted_count >= 0),
  isolated_count bigint NOT NULL DEFAULT 0 CHECK (isolated_count >= 0),
  started_at timestamptz NOT NULL,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((scope_type = 'full' AND scope_key = '') OR (scope_type = 'asset' AND scope_key <> '')),
  CHECK (accepted_count <= processed_count),
  CHECK ((status = 'running' AND finished_at IS NULL) OR (status <> 'running' AND finished_at IS NOT NULL))
);

CREATE INDEX collection_runs_scope_started_index ON collection_runs(plugin_id, source_id, scope_type, scope_key, started_at DESC);

CREATE TABLE collection_checkpoints (
  plugin_id varchar(255) NOT NULL,
  source_id varchar(255) NOT NULL,
  scope_type varchar(16) NOT NULL CHECK (scope_type IN ('full', 'asset')),
  scope_key varchar(255) NOT NULL,
  config_revision varchar(255) NOT NULL,
  checkpoint jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (plugin_id, source_id, scope_type, scope_key, config_revision),
  CHECK ((scope_type = 'full' AND scope_key = '') OR (scope_type = 'asset' AND scope_key <> ''))
);

CREATE TABLE collection_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES collection_runs(id) ON DELETE RESTRICT,
  batch_start_checkpoint jsonb,
  source_index bigint NOT NULL CHECK (source_index >= 0),
  code varchar(255) NOT NULL,
  path varchar(2048) NOT NULL,
  message varchar(2048) NOT NULL,
  key_hint varchar(100),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX collection_issues_run_index ON collection_issues(run_id, source_index);
