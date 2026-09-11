import { createPool, type Pool, type PoolConnection, type PoolOptions } from 'mysql2/promise';
import { isIP } from 'node:net';
import type { PlatformDbAdapterFactory, PlatformDbConfig, PlatformDbConnection } from './types';
import { PlatformDbConnectionError } from './errors';

export interface MysqlPlatformDbConnection extends PlatformDbConnection {
  withClient<T>(work: (client: PoolConnection) => Promise<T>): Promise<T>;
}

export function mysqlPoolConfig(config: PlatformDbConfig): PoolOptions {
  return {
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    connectionLimit: config.poolMax,
    connectTimeout: config.connectTimeoutMs,
    timezone: 'Z',
    enableKeepAlive: true,
    ssl: config.tls.mode === 'disable' ? undefined : {
      rejectUnauthorized: true,
      verifyIdentity: true,
      ...(config.tls.ca === undefined ? {} : { ca: config.tls.ca }),
    },
  };
}

async function quietlyEnd(pool: Pool): Promise<void> {
  try { await pool.end(); } catch { /* 드라이버 상세를 공개 오류에 섞지 않는다. */ }
}

export const mysqlAdapter: PlatformDbAdapterFactory = {
  id: 'mysql',
  contractVersion: 1,
  defaultPort: 3306,
  async connect(config): Promise<MysqlPlatformDbConnection> {
    // mysql2는 IP literal에 servername을 설정하지 않아 인증서 IP SAN 검사를 생략한다.
    // verify-full에서는 검증 가능한 DNS 이름만 허용해 조용한 신원 검증 우회를 막는다.
    if (config.tls.mode === 'verify-full' && isIP(config.host) !== 0) {
      throw new PlatformDbConnectionError('CONNECT_FAILED');
    }
    const pool = createPool(mysqlPoolConfig(config));
    let closed = false;
    let closing: Promise<void> | undefined;
    try {
      await pool.query('SELECT 1');
    } catch {
      await quietlyEnd(pool);
      throw new PlatformDbConnectionError('CONNECT_FAILED');
    }
    return {
      async checkReady() {
        if (closed) return false;
        try { await pool.query('SELECT 1'); return true; } catch { return false; }
      },
      async withClient<T>(work: (client: PoolConnection) => Promise<T>): Promise<T> {
        if (closed) throw new PlatformDbConnectionError('CONNECTION_CLOSED');
        const client = await pool.getConnection();
        try { return await work(client); } finally { client.release(); }
      },
      close() {
        if (!closing) {
          closed = true;
          closing = quietlyEnd(pool);
        }
        return closing;
      },
    };
  },
};
