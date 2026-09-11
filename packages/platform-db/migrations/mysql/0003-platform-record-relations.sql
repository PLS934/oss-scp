CREATE TABLE platform_record_relations (
  id char(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  identity_hash binary(32) NOT NULL,
  scope_hash binary(32) NOT NULL,
  plugin_id varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin NOT NULL,
  source_id varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin NOT NULL,
  relation_type varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin NOT NULL,
  from_record_id char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  to_record_id char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT platform_record_relations_identity_hash_unique UNIQUE (identity_hash),
  CONSTRAINT platform_record_relations_from_fk FOREIGN KEY (from_record_id) REFERENCES platform_records(id) ON DELETE RESTRICT,
  CONSTRAINT platform_record_relations_to_fk FOREIGN KEY (to_record_id) REFERENCES platform_records(id) ON DELETE RESTRICT,
  INDEX platform_record_relations_scope_index (scope_hash),
  INDEX platform_record_relations_from_index (from_record_id),
  INDEX platform_record_relations_to_index (to_record_id)
) ENGINE=InnoDB;
