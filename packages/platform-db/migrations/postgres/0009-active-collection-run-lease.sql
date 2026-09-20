DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM collection_runs
    WHERE status = 'running' AND coordinated
    GROUP BY plugin_id, source_id, scope_type, scope_key
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicate active coordinated collection runs require operator resolution';
  END IF;
END $$;

CREATE UNIQUE INDEX collection_runs_one_active_lease_index
  ON collection_runs(plugin_id, source_id, scope_type, scope_key)
  WHERE status = 'running' AND coordinated;
