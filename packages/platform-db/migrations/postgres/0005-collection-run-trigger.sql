ALTER TABLE collection_runs ADD COLUMN trigger varchar(16) NOT NULL DEFAULT 'cli';
ALTER TABLE collection_runs ADD COLUMN request_id varchar(255);
ALTER TABLE collection_runs ADD CONSTRAINT collection_runs_trigger_check CHECK (trigger IN ('startup', 'cli', 'api'));
ALTER TABLE collection_runs ADD CONSTRAINT collection_runs_request_trigger_check CHECK (request_id IS NULL OR trigger = 'api');
CREATE INDEX collection_runs_request_index ON collection_runs(request_id) WHERE request_id IS NOT NULL;
