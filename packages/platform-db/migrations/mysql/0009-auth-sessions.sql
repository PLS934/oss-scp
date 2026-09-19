CREATE TABLE auth_sessions (
  session_hash char(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  user_id varchar(512) NOT NULL,
  login_id varchar(512) NOT NULL,
  created_at datetime(3) NOT NULL,
  expires_at datetime(3) NOT NULL,
  CONSTRAINT auth_sessions_hash_check CHECK (session_hash REGEXP '^[0-9a-f]{64}$'),
  CONSTRAINT auth_sessions_expiry_check CHECK (expires_at > created_at),
  INDEX auth_sessions_expiry_index (expires_at)
) ENGINE=InnoDB;
