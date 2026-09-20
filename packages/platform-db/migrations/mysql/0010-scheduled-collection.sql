ALTER TABLE collection_runs
  DROP CHECK collection_runs_trigger_check,
  DROP CHECK collection_runs_request_trigger_check,
  ADD COLUMN scheduled_at datetime(3),
  ADD COLUMN schedule_timezone varchar(255) CHARACTER SET ascii COLLATE ascii_bin,
  ADD CONSTRAINT collection_runs_trigger_check CHECK (`trigger` IN ('startup', 'scheduled', 'cli', 'api')),
  ADD CONSTRAINT collection_runs_request_trigger_check CHECK (request_id IS NULL OR `trigger` = 'api'),
  ADD CONSTRAINT collection_runs_schedule_metadata_check CHECK (
    (`trigger` = 'scheduled' AND scheduled_at IS NOT NULL AND schedule_timezone IS NOT NULL AND request_id IS NULL)
    OR (`trigger` <> 'scheduled' AND scheduled_at IS NULL AND schedule_timezone IS NULL)
  );
