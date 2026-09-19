import type { MysqlPlatformDbConnection } from './mysql';
import type { PostgresPlatformDbConnection } from './postgres';

export interface AuthSession {
  sessionHash: string;
  userId: string;
  loginId: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface AuthSessionRepository {
  create(session: AuthSession): Promise<void>;
  findValid(sessionHash: string, now: Date): Promise<AuthSession | null>;
  delete(sessionHash: string): Promise<void>;
  deleteExpired(now: Date, limit: number): Promise<number>;
}

type SessionRow = { session_hash: string; user_id: string; login_id: string; created_at: Date | string; expires_at: Date | string };

function session(row: SessionRow): AuthSession {
  return {
    sessionHash: row.session_hash,
    userId: row.user_id,
    loginId: row.login_id,
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
    expiresAt: row.expires_at instanceof Date ? row.expires_at : new Date(row.expires_at),
  };
}

function cleanupLimit(limit: number): number {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new RangeError('session cleanup limit');
  return limit;
}

export function createPostgresAuthSessionRepository(connection: PostgresPlatformDbConnection): AuthSessionRepository {
  return {
    async create(value) {
      await connection.withClient(client => client.query(
        'INSERT INTO auth_sessions(session_hash, user_id, login_id, created_at, expires_at) VALUES ($1, $2, $3, $4, $5)',
        [value.sessionHash, value.userId, value.loginId, value.createdAt, value.expiresAt],
      ));
    },
    async findValid(sessionHash, now) {
      return connection.withClient(async client => {
        const result = await client.query<SessionRow>(`SELECT session_hash, user_id, login_id, created_at, expires_at
          FROM auth_sessions WHERE session_hash=$1 AND expires_at>$2`, [sessionHash, now]);
        if (result.rows[0]) return session(result.rows[0]);
        await client.query('DELETE FROM auth_sessions WHERE session_hash=$1 AND expires_at<=$2', [sessionHash, now]);
        return null;
      });
    },
    async delete(sessionHash) { await connection.withClient(client => client.query('DELETE FROM auth_sessions WHERE session_hash=$1', [sessionHash])); },
    async deleteExpired(now, limit) {
      const result = await connection.withClient(client => client.query(`DELETE FROM auth_sessions WHERE session_hash IN (
        SELECT session_hash FROM auth_sessions WHERE expires_at<=$1 ORDER BY expires_at LIMIT $2
      )`, [now, cleanupLimit(limit)]));
      return result.rowCount ?? 0;
    },
  };
}

export function createMysqlAuthSessionRepository(connection: MysqlPlatformDbConnection): AuthSessionRepository {
  return {
    async create(value) {
      await connection.withClient(client => client.query(
        'INSERT INTO auth_sessions(session_hash, user_id, login_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
        [value.sessionHash, value.userId, value.loginId, value.createdAt, value.expiresAt],
      ));
    },
    async findValid(sessionHash, now) {
      return connection.withClient(async client => {
        const [rows] = await client.query('SELECT session_hash, user_id, login_id, created_at, expires_at FROM auth_sessions WHERE session_hash=? AND expires_at>?', [sessionHash, now]) as [SessionRow[], unknown];
        if (rows[0]) return session(rows[0]);
        await client.query('DELETE FROM auth_sessions WHERE session_hash=? AND expires_at<=?', [sessionHash, now]);
        return null;
      });
    },
    async delete(sessionHash) { await connection.withClient(client => client.query('DELETE FROM auth_sessions WHERE session_hash=?', [sessionHash])); },
    async deleteExpired(now, limit) {
      const [result] = await connection.withClient(client => client.query('DELETE FROM auth_sessions WHERE expires_at<=? ORDER BY expires_at LIMIT ?', [now, cleanupLimit(limit)])) as [{ affectedRows?: number }, unknown];
      return result.affectedRows ?? 0;
    },
  };
}
