CREATE TABLE scheduled_collection_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  active_run_id uuid NOT NULL REFERENCES collection_runs(id) ON DELETE RESTRICT,
  scheduled_at timestamptz NOT NULL,
  schedule_timezone varchar(255) NOT NULL,
  observed_at timestamptz NOT NULL,
  CONSTRAINT scheduled_collection_references_unique UNIQUE (active_run_id, scheduled_at, schedule_timezone)
);

CREATE INDEX scheduled_collection_references_scheduled_index
  ON scheduled_collection_references(scheduled_at DESC, id DESC);
