ALTER TABLE collection_runs
  ADD COLUMN `trigger` varchar(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'cli',
  ADD COLUMN request_id varchar(255) CHARACTER SET ascii COLLATE ascii_bin,
  ADD CONSTRAINT collection_runs_trigger_check CHECK (`trigger` IN ('startup', 'cli', 'api')),
  ADD CONSTRAINT collection_runs_request_trigger_check CHECK (request_id IS NULL OR `trigger` = 'api'),
  ADD INDEX collection_runs_request_index (request_id);
