import { readFileSync } from 'node:fs';
import { X509Certificate } from 'node:crypto';

export interface DisabledAuthConfig { enabled: false }
export interface EnabledAuthConfig {
  enabled: true;
  trustedProxyHops: number;
  ldap: {
    url: string;
    bindDn: string;
    bindPassword: string;
    searchBaseDn: string;
    searchFilter: string;
    userIdAttribute: string;
    ca?: string;
    timeoutMs: number;
  };
  session: { secret: string; ttlSeconds: number; secure: boolean };
}
export type AuthConfig = DisabledAuthConfig | EnabledAuthConfig;

export class AuthConfigError extends Error {
  constructor(readonly setting: string) {
    super(`인증 설정을 확인하세요: ${setting}`);
    this.name = 'AuthConfigError';
  }
}

function hasControlCharacter(value: string): boolean {
  return [...value].some(character => {
    const code = character.codePointAt(0)!;
    return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
  });
}

function required(env: NodeJS.ProcessEnv, name: string, max = 4096): string {
  const value = env[name];
  if (!value || value !== value.trim() || value.length > max || hasControlCharacter(value)) throw new AuthConfigError(name);
  return value;
}

function secret(env: NodeJS.ProcessEnv, name: string, fileName: string): string {
  const direct = env[name];
  const file = env[fileName];
  if ((direct === undefined) === (file === undefined)) throw new AuthConfigError(`${name}/${fileName}`);
  let value: string;
  if (file !== undefined) {
    if (!file || !file.startsWith('/') || hasControlCharacter(file)) throw new AuthConfigError(fileName);
    try {
      const bytes = readFileSync(file);
      if (bytes.length === 0 || bytes.length > 16_384) throw new Error('invalid');
      value = bytes.toString('utf8').replace(/\r?\n$/u, '');
    } catch { throw new AuthConfigError(fileName); }
  } else value = direct!;
  if (!value || Buffer.byteLength(value) > 16_384 || hasControlCharacter(value)) throw new AuthConfigError(name);
  return value;
}

function caCertificate(env: NodeJS.ProcessEnv): string | undefined {
  const path = env.LDAP_TLS_CA_FILE;
  if (path === undefined) return undefined;
  if (!path || !path.startsWith('/') || hasControlCharacter(path)) throw new AuthConfigError('LDAP_TLS_CA_FILE');
  try {
    const bytes = readFileSync(path);
    if (bytes.length === 0 || bytes.length > 1_048_576) throw new Error('invalid');
    const pem = bytes.toString('utf8');
    const blocks = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/gu);
    if (!blocks || blocks.join('\n').replace(/\s/gu, '') !== pem.replace(/\s/gu, '')) throw new Error('invalid');
    for (const block of blocks) new X509Certificate(block);
    return pem;
  } catch { throw new AuthConfigError('LDAP_TLS_CA_FILE'); }
}

export function readAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const rawEnabled = env.AUTH_ENABLED ?? 'false';
  if (rawEnabled !== 'true' && rawEnabled !== 'false') throw new AuthConfigError('AUTH_ENABLED');
  if (rawEnabled === 'false') return { enabled: false };

  const rawUrl = required(env, 'LDAP_URL', 2048);
  let url: URL;
  try { url = new URL(rawUrl); } catch { throw new AuthConfigError('LDAP_URL'); }
  if (!['ldap:', 'ldaps:'].includes(url.protocol) || !url.hostname || url.username || url.password || !['', '/'].includes(url.pathname) || url.search || url.hash) {
    throw new AuthConfigError('LDAP_URL');
  }
  const searchFilter = required(env, 'LDAP_USER_SEARCH_FILTER');
  if (searchFilter.split('{{login}}').length !== 2) throw new AuthConfigError('LDAP_USER_SEARCH_FILTER');
  const userIdAttribute = required(env, 'LDAP_USER_ID_ATTRIBUTE', 128);
  if (!/^[a-zA-Z][a-zA-Z0-9-]*$/u.test(userIdAttribute)) throw new AuthConfigError('LDAP_USER_ID_ATTRIBUTE');
  const sessionSecret = secret(env, 'AUTH_SESSION_SECRET', 'AUTH_SESSION_SECRET_FILE');
  if (Buffer.byteLength(sessionSecret) < 32) throw new AuthConfigError('AUTH_SESSION_SECRET');
  const rawTtl = env.AUTH_SESSION_TTL_SECONDS ?? '28800';
  if (!/^\d+$/u.test(rawTtl)) throw new AuthConfigError('AUTH_SESSION_TTL_SECONDS');
  const ttlSeconds = Number(rawTtl);
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 300 || ttlSeconds > 604_800) throw new AuthConfigError('AUTH_SESSION_TTL_SECONDS');
  const rawTrustedProxyHops = env.AUTH_TRUST_PROXY_HOPS ?? '0';
  if (!/^\d+$/u.test(rawTrustedProxyHops)) throw new AuthConfigError('AUTH_TRUST_PROXY_HOPS');
  const trustedProxyHops = Number(rawTrustedProxyHops);
  if (!Number.isSafeInteger(trustedProxyHops) || trustedProxyHops > 10) throw new AuthConfigError('AUTH_TRUST_PROXY_HOPS');

  return {
    enabled: true,
    trustedProxyHops,
    ldap: {
      url: rawUrl,
      bindDn: required(env, 'LDAP_BIND_DN'),
      bindPassword: secret(env, 'LDAP_BIND_PASSWORD', 'LDAP_BIND_PASSWORD_FILE'),
      searchBaseDn: required(env, 'LDAP_USER_SEARCH_BASE_DN'),
      searchFilter,
      userIdAttribute,
      ca: caCertificate(env),
      timeoutMs: 5000,
    },
    session: { secret: sessionSecret, ttlSeconds, secure: env.NODE_ENV === 'production' },
  };
}
