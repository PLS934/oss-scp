DROP INDEX platform_records_scope_index;

CREATE INDEX platform_records_cursor_index
  ON platform_records(plugin_id, source_id, data_type, last_seen_at DESC, id ASC);
