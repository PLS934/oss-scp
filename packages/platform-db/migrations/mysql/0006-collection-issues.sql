CREATE TABLE collection_issues (
  id char(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  run_id char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  batch_start_checkpoint json,
  source_index bigint unsigned NOT NULL,
  code varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin NOT NULL,
  path varchar(2048) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin NOT NULL,
  message varchar(2048) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin NOT NULL,
  key_hint varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin,
  created_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT collection_issues_run_fk FOREIGN KEY (run_id) REFERENCES collection_runs(id) ON DELETE RESTRICT,
  INDEX collection_issues_run_index (run_id, source_index)
) ENGINE=InnoDB;
