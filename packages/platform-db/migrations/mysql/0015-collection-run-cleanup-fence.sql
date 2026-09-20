ALTER TABLE collection_runs
  ALTER COLUMN finish_authorized SET DEFAULT false,
  ADD CONSTRAINT collection_runs_fresh_cleanup_guard CHECK (
    status <> 'failed' OR coordinated = false OR finish_authorized = true
    OR TIMESTAMPDIFF(MICROSECOND, heartbeat_at, finished_at) >= 120000000
  );
