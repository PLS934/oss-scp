CREATE TABLE platform_records (
  id char(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  identity_hash binary(32) NOT NULL,
  query_scope_hash binary(32) NOT NULL,
  plugin_id varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin NOT NULL,
  data_type varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin NOT NULL,
  source_id varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin NOT NULL,
  external_key_type varchar(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  external_key varchar(2048) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin NOT NULL,
  source_values json NOT NULL,
  first_seen_at datetime(3) NOT NULL,
  last_seen_at datetime(3) NOT NULL,
  created_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT platform_records_external_key_type_check CHECK (external_key_type IN ('string', 'number')),
  CONSTRAINT platform_records_source_values_object_check CHECK (JSON_TYPE(source_values) = 'OBJECT'),
  CONSTRAINT platform_records_identity_hash_unique UNIQUE (identity_hash),
  INDEX platform_records_cursor_index (query_scope_hash, last_seen_at DESC, id ASC)
) ENGINE=InnoDB;
