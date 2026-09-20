ALTER TABLE collection_runs
  ADD COLUMN lease_hash binary(32) GENERATED ALWAYS AS (
    UNHEX(SHA2(UNHEX(CONCAT(
      LPAD(HEX(OCTET_LENGTH(plugin_id)), 8, '0'), HEX(plugin_id),
      LPAD(HEX(OCTET_LENGTH(source_id)), 8, '0'), HEX(source_id),
      LPAD(HEX(OCTET_LENGTH(scope_type)), 8, '0'), HEX(scope_type),
      LPAD(HEX(OCTET_LENGTH(scope_key)), 8, '0'), HEX(scope_key)
    )), 256))
  ) STORED,
  ADD COLUMN active_lease_marker tinyint GENERATED ALWAYS AS (
    CASE WHEN status = 'running' AND coordinated = 1 THEN 1 ELSE NULL END
  ) STORED,
  ADD INDEX collection_runs_active_lease_index (lease_hash, status, coordinated, heartbeat_at),
  ADD UNIQUE INDEX collection_runs_one_active_lease_index (lease_hash, active_lease_marker);
