ALTER TABLE collection_runs
  ADD COLUMN heartbeat_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ADD COLUMN coordinated boolean NOT NULL DEFAULT false,
  ADD INDEX collection_runs_active_scope_index (scope_hash, status, coordinated, heartbeat_at);
