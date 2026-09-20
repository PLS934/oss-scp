ALTER TABLE collection_runs DROP CONSTRAINT collection_runs_trigger_check;
ALTER TABLE collection_runs DROP CONSTRAINT collection_runs_request_trigger_check;
ALTER TABLE collection_runs ADD COLUMN scheduled_at timestamptz;
ALTER TABLE collection_runs ADD COLUMN schedule_timezone varchar(255);
ALTER TABLE collection_runs ADD CONSTRAINT collection_runs_trigger_check CHECK (trigger IN ('startup', 'scheduled', 'cli', 'api'));
ALTER TABLE collection_runs ADD CONSTRAINT collection_runs_request_trigger_check CHECK (request_id IS NULL OR trigger = 'api');
ALTER TABLE collection_runs ADD CONSTRAINT collection_runs_schedule_metadata_check CHECK (
  (trigger = 'scheduled' AND scheduled_at IS NOT NULL AND schedule_timezone IS NOT NULL AND request_id IS NULL)
  OR (trigger <> 'scheduled' AND scheduled_at IS NULL AND schedule_timezone IS NULL)
);
