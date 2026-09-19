CREATE TABLE auth_sessions (
  session_hash char(64) PRIMARY KEY,
  user_id text NOT NULL,
  login_id text NOT NULL,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  CONSTRAINT auth_sessions_hash_check CHECK (session_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT auth_sessions_expiry_check CHECK (expires_at > created_at)
);

CREATE INDEX auth_sessions_expiry_index ON auth_sessions(expires_at);
