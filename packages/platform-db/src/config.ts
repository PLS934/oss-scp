import { X509Certificate } from 'node:crypto';
import { selectPlatformDbAdapter } from './adapters';
import { PlatformDbConfigError, type PlatformDbErrorCode, type PlatformDbSetting } from './errors';
import { readConfigFile } from './files';
import type { PlatformDbAdapterFactory, PlatformDbConfig, PlatformDbTls } from './types';

type Environment = Readonly<Record<string, string | undefined>>;

function text(env: Environment, key: PlatformDbSetting): string {
  const value = env[key];
  if (value === undefined) throw new PlatformDbConfigError('REQUIRED', key);
  if (!value.trim() || value !== value.trim() || /\p{Cc}/u.test(value)) {
    throw new PlatformDbConfigError('INVALID_TEXT', key);
  }
  return value;
}

function integer(env: Environment, key: PlatformDbSetting, fallback: number, max: number, code: PlatformDbErrorCode): number {
  const raw = env[key];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isInteger(value) || value < 1 || value > max) {
    throw new PlatformDbConfigError(code, key);
  }
  return value;
}

function password(env: Environment): string {
  const direct = env.PLATFORM_DB_PASSWORD;
  const file = env.PLATFORM_DB_PASSWORD_FILE;
  if ((direct !== undefined) === (file !== undefined)) {
    throw new PlatformDbConfigError('PASSWORD_SOURCE', 'PLATFORM_DB_PASSWORD');
  }
  const value = file !== undefined
    ? readConfigFile(file, 16 * 1024, 'PLATFORM_DB_PASSWORD_FILE').replace(/\r?\n$/, '')
    : direct!;
  if (!value || (/[\r\n]/u.test(value) || value.includes(String.fromCharCode(0))) || Buffer.byteLength(value, 'utf8') > 16 * 1024) {
    throw new PlatformDbConfigError('INVALID_PASSWORD', file !== undefined ? 'PLATFORM_DB_PASSWORD_FILE' : 'PLATFORM_DB_PASSWORD');
  }
  return value;
}

function tls(env: Environment): PlatformDbTls {
  const mode = env.PLATFORM_DB_TLS_MODE ?? 'verify-full';
  if (mode !== 'disable' && mode !== 'verify-full') {
    throw new PlatformDbConfigError('INVALID_TLS', 'PLATFORM_DB_TLS_MODE');
  }
  const path = env.PLATFORM_DB_TLS_CA_FILE;
  if (path === undefined) return { mode };
  if (mode === 'disable') throw new PlatformDbConfigError('TLS_CA_CONFLICT', 'PLATFORM_DB_TLS_CA_FILE');
  const ca = readConfigFile(path, 1024 * 1024, 'PLATFORM_DB_TLS_CA_FILE');
  try {
    const certificates = ca.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
    if (!certificates?.length) throw new Error();
    let remainder = ca;
    for (const certificate of certificates) {
      new X509Certificate(certificate);
      remainder = remainder.replace(certificate, '');
    }
    if (remainder.trim()) throw new Error();
  } catch {
    throw new PlatformDbConfigError('INVALID_CA', 'PLATFORM_DB_TLS_CA_FILE');
  }
  return { mode, ca };
}

/** 설정 검사만 수행한다. 환경 파일 로드·네트워크 연결은 호출자 책임이다. */
export function readPlatformDbConfig(env: Environment, adapters: readonly PlatformDbAdapterFactory[]): PlatformDbConfig {
  const type = text(env, 'PLATFORM_DB_TYPE');
  const adapter = selectPlatformDbAdapter(type, adapters);
  const host = text(env, 'PLATFORM_DB_HOST');
  if (host.includes('://') || host.startsWith('//')) throw new PlatformDbConfigError('INVALID_TEXT', 'PLATFORM_DB_HOST');
  return {
    type, host,
    port: integer(env, 'PLATFORM_DB_PORT', adapter.defaultPort, 65535, 'INVALID_PORT'),
    database: text(env, 'PLATFORM_DB_NAME'),
    user: text(env, 'PLATFORM_DB_USER'),
    poolMax: integer(env, 'PLATFORM_DB_POOL_MAX', 10, 100, 'INVALID_POOL_MAX'),
    connectTimeoutMs: integer(env, 'PLATFORM_DB_CONNECT_TIMEOUT_MS', 5000, 60000, 'INVALID_TIMEOUT'),
    tls: tls(env),
    password: password(env),
  };
}
