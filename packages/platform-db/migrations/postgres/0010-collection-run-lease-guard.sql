CREATE TABLE collection_run_lease_guards (
  plugin_id varchar(255) NOT NULL,
  source_id varchar(255) NOT NULL,
  scope_type varchar(16) NOT NULL,
  scope_key varchar(255) NOT NULL,
  PRIMARY KEY (plugin_id, source_id, scope_type, scope_key)
);

CREATE FUNCTION guard_collection_run_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  active_run_id uuid;
BEGIN
  IF NEW.status = 'running' AND NEW.coordinated THEN
    INSERT INTO collection_run_lease_guards(plugin_id, source_id, scope_type, scope_key)
      VALUES (NEW.plugin_id, NEW.source_id, NEW.scope_type, NEW.scope_key)
      ON CONFLICT DO NOTHING;
    PERFORM 1 FROM collection_run_lease_guards
      WHERE plugin_id = NEW.plugin_id AND source_id = NEW.source_id
        AND scope_type = NEW.scope_type AND scope_key = NEW.scope_key
      FOR UPDATE;
    SELECT id INTO active_run_id FROM collection_runs
      WHERE plugin_id = NEW.plugin_id AND source_id = NEW.source_id
        AND scope_type = NEW.scope_type AND scope_key = NEW.scope_key
        AND status = 'running' AND coordinated
      ORDER BY started_at DESC, id DESC LIMIT 1;
    IF active_run_id IS NOT NULL THEN
      RAISE EXCEPTION 'coordinated collection run is already active'
        USING ERRCODE = 'P0001',
          CONSTRAINT = 'collection_runs_one_active_lease_guard',
          DETAIL = active_run_id::text;
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER collection_runs_lease_insert_guard
  BEFORE INSERT ON collection_runs
  FOR EACH ROW EXECUTE FUNCTION guard_collection_run_insert();

CREATE FUNCTION guard_fresh_collection_run_cleanup() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'running' AND OLD.coordinated
     AND NEW.status = 'failed'
     AND OLD.heartbeat_at > clock_timestamp() - interval '2 minutes'
     AND current_setting('oss_scp.finishing_run_id', true) IS DISTINCT FROM OLD.id::text THEN
    RAISE EXCEPTION 'fresh coordinated collection run cannot be cleaned up'
      USING ERRCODE = 'P0001', CONSTRAINT = 'collection_runs_fresh_cleanup_guard';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER collection_runs_fresh_cleanup_guard
  BEFORE UPDATE ON collection_runs
  FOR EACH ROW EXECUTE FUNCTION guard_fresh_collection_run_cleanup();
