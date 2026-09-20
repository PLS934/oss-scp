CREATE TABLE scheduled_collection_references (
  id char(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  active_run_id char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  scheduled_at datetime(3) NOT NULL,
  schedule_timezone varchar(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  observed_at datetime(3) NOT NULL,
  CONSTRAINT scheduled_collection_references_run_fk FOREIGN KEY (active_run_id) REFERENCES collection_runs(id) ON DELETE RESTRICT,
  CONSTRAINT scheduled_collection_references_unique UNIQUE (active_run_id, scheduled_at, schedule_timezone),
  INDEX scheduled_collection_references_scheduled_index (scheduled_at DESC, id DESC)
);
