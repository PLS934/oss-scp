ALTER TABLE collection_runs ADD COLUMN heartbeat_at timestamptz;
ALTER TABLE collection_runs ADD COLUMN coordinated boolean NOT NULL DEFAULT false;
UPDATE collection_runs SET heartbeat_at = COALESCE(finished_at, started_at);
ALTER TABLE collection_runs ALTER COLUMN heartbeat_at SET NOT NULL;
CREATE INDEX collection_runs_active_scope_index
  ON collection_runs(plugin_id, source_id, scope_type, scope_key, heartbeat_at)
  WHERE status = 'running' AND coordinated;
