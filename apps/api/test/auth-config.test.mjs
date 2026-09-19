import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readAuthConfig } from '../dist/auth-config.js';

const root = mkdtempSync(join(tmpdir(), 'oss-scp-auth-config-'));
const base = {
  AUTH_ENABLED: 'true', LDAP_URL: 'ldaps://ldap.example.com:636', LDAP_BIND_DN: 'cn=service,dc=example,dc=com',
  LDAP_BIND_PASSWORD: 'bind-password', LDAP_USER_SEARCH_BASE_DN: 'ou=users,dc=example,dc=com',
  LDAP_USER_SEARCH_FILTER: '(uid={{login}})', LDAP_USER_ID_ATTRIBUTE: 'entryUUID',
  AUTH_SESSION_SECRET: 'x'.repeat(32), AUTH_SESSION_TTL_SECONDS: '28800',
};

describe('인증 설정', () => {
  it('기본값은 비활성화이며 LDAP 설정을 요구하지 않는다', () => expect(readAuthConfig({})).toEqual({ enabled: false }));
  it('LDAPS와 StartTLS URL을 받고 운영 쿠키를 구분한다', () => {
    expect(readAuthConfig(base)).toMatchObject({ enabled: true, trustedProxyHops: 0, ldap: { url: base.LDAP_URL }, session: { secure: false, ttlSeconds: 28800 } });
    expect(readAuthConfig({ ...base, LDAP_URL: 'ldap://ad.example.com:389', NODE_ENV: 'production', AUTH_TRUST_PROXY_HOPS: '1' })).toMatchObject({ trustedProxyHops: 1, ldap: { url: 'ldap://ad.example.com:389' }, session: { secure: true } });
  });
  it.each(['http://ldap', 'ldaps://user:pw@ldap.example.com', 'ldaps://ldap.example.com/path'])('안전하지 않은 URL %s를 거부한다', LDAP_URL => expect(() => readAuthConfig({ ...base, LDAP_URL })).toThrow('LDAP_URL'));
  it.each(['', 'true ', '1'])('잘못된 활성화 값 %s를 거부한다', AUTH_ENABLED => expect(() => readAuthConfig({ ...base, AUTH_ENABLED })).toThrow('AUTH_ENABLED'));
  it('필수 설정과 filter placeholder를 검사한다', () => {
    for (const key of ['LDAP_BIND_DN', 'LDAP_USER_SEARCH_BASE_DN', 'LDAP_USER_SEARCH_FILTER', 'LDAP_USER_ID_ATTRIBUTE']) expect(() => readAuthConfig({ ...base, [key]: undefined })).toThrow(key);
    expect(() => readAuthConfig({ ...base, LDAP_USER_SEARCH_FILTER: '(uid=*)' })).toThrow('LDAP_USER_SEARCH_FILTER');
    expect(() => readAuthConfig({ ...base, LDAP_USER_SEARCH_FILTER: '(|(uid={{login}})(mail={{login}}))' })).toThrow('LDAP_USER_SEARCH_FILTER');
  });
  it('secret direct/file 충돌과 길이를 검사하고 값을 오류에 노출하지 않는다', () => {
    const secretFile = join(root, 'secret'); writeFileSync(secretFile, 'file-secret-value');
    expect(readAuthConfig({ ...base, LDAP_BIND_PASSWORD: undefined, LDAP_BIND_PASSWORD_FILE: secretFile })).toMatchObject({ ldap: { bindPassword: 'file-secret-value' } });
    expect(() => readAuthConfig({ ...base, LDAP_BIND_PASSWORD_FILE: secretFile })).toThrow('LDAP_BIND_PASSWORD');
    const marker = 'do-not-leak';
    try { readAuthConfig({ ...base, AUTH_SESSION_SECRET: marker }); } catch (error) { expect(String(error)).not.toContain(marker); }
  });
  it.each(['299', '604801', '1.5', 'abc'])('잘못된 TTL %s를 거부한다', AUTH_SESSION_TTL_SECONDS => expect(() => readAuthConfig({ ...base, AUTH_SESSION_TTL_SECONDS })).toThrow('AUTH_SESSION_TTL_SECONDS'));
  it.each(['-1', '1.5', '11', 'true'])('잘못된 trusted proxy 홉 %s를 거부한다', AUTH_TRUST_PROXY_HOPS => expect(() => readAuthConfig({ ...base, AUTH_TRUST_PROXY_HOPS })).toThrow('AUTH_TRUST_PROXY_HOPS'));
});
