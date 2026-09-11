CREATE TABLE collection_checkpoints (
  scope_hash binary(32) PRIMARY KEY,
  plugin_id varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin NOT NULL,
  source_id varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin NOT NULL,
  scope_type varchar(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  scope_key varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin NOT NULL,
  config_revision varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin NOT NULL,
  checkpoint json NOT NULL,
  updated_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT collection_checkpoints_scope_type_check CHECK (scope_type IN ('full', 'asset')),
  CONSTRAINT collection_checkpoints_scope_key_check CHECK ((scope_type = 'full' AND scope_key = '') OR (scope_type = 'asset' AND scope_key <> ''))
) ENGINE=InnoDB;
