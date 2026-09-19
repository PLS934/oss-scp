import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GenericContainer, Wait } from 'testcontainers';
import { LdapAuthenticator } from '../dist/ldap-authenticator.js';

const image = 'bitnamilegacy/openldap@sha256:966fd39ed25813890e9bd57dac56def163bbcfe64967e0bae59ab018d505bd93';
const adminPassword = 'admin-integration-password';
let container; let directory; let ca;

beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), 'oss-scp-ldap-'));
  execFileSync('openssl', ['req', '-new', '-x509', '-nodes', '-days', '1', '-subj', '/CN=oss-scp-test-ca', '-keyout', join(directory, 'ca.key'), '-out', join(directory, 'ca.crt')]);
  execFileSync('openssl', ['req', '-new', '-nodes', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost', '-keyout', join(directory, 'ldap.key'), '-out', join(directory, 'ldap.csr')]);
  writeFileSync(join(directory, 'extensions.cnf'), 'subjectAltName=DNS:localhost\nextendedKeyUsage=serverAuth\n');
  execFileSync('openssl', ['x509', '-req', '-days', '1', '-in', join(directory, 'ldap.csr'), '-CA', join(directory, 'ca.crt'), '-CAkey', join(directory, 'ca.key'), '-CAcreateserial', '-extfile', join(directory, 'extensions.cnf'), '-out', join(directory, 'ldap.crt')]);
  ca = readFileSync(join(directory, 'ca.crt'), 'utf8');
  container = await new GenericContainer(image)
    .withHostname('localhost')
    .withEnvironment({
      LDAP_ROOT: 'dc=example,dc=org', LDAP_ADMIN_USERNAME: 'admin', LDAP_ADMIN_PASSWORD: adminPassword,
      LDAP_USERS: 'alice', LDAP_PASSWORDS: 'correct-password', LDAP_USER_OU: 'users', LDAP_GROUP_OU: 'groups',
      LDAP_ENABLE_TLS: 'yes', LDAP_TLS_CERT_FILE: '/opt/bitnami/openldap/certs/ldap.crt',
      LDAP_TLS_KEY_FILE: '/opt/bitnami/openldap/certs/ldap.key', LDAP_TLS_CA_FILE: '/opt/bitnami/openldap/certs/ca.crt',
      LDAP_TLS_VERIFY_CLIENT: 'never',
    })
    .withCopyFilesToContainer([
      { source: join(directory, 'ca.crt'), target: '/opt/bitnami/openldap/certs/ca.crt' },
      { source: join(directory, 'ldap.crt'), target: '/opt/bitnami/openldap/certs/ldap.crt' },
      { source: join(directory, 'ldap.key'), target: '/opt/bitnami/openldap/certs/ldap.key', mode: 0o644 },
    ])
    .withExposedPorts(1389, 1636).withWaitStrategy(Wait.forListeningPorts()).start();
  await new Promise(resolve => setTimeout(resolve, 500));
}, 180_000);

afterAll(async () => { await container?.stop(); if (directory) rmSync(directory, { recursive: true, force: true }); });

function config(protocol) {
  const port = container.getMappedPort(protocol === 'ldaps' ? 1636 : 1389);
  return {
    url: `${protocol}://localhost:${port}`, bindDn: 'cn=admin,dc=example,dc=org', bindPassword: adminPassword,
    searchBaseDn: 'ou=users,dc=example,dc=org', searchFilter: '(uid={{login}})', userIdAttribute: 'uid', ca, timeoutMs: 5000,
  };
}

describe('실제 TLS LDAP 인증', () => {
  it.each(['ldap', 'ldaps'])('%s 연결에서 검색 후 사용자 Bind에 성공한다', async protocol => {
    await expect(new LdapAuthenticator(config(protocol)).authenticate('alice', 'correct-password')).resolves.toMatchObject({ loginId: 'alice' });
  });
  it('잘못된 비밀번호와 filter injection 입력을 같은 실패로 처리한다', async () => {
    const auth = new LdapAuthenticator(config('ldaps'));
    await expect(auth.authenticate('alice', 'wrong-password')).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    await expect(auth.authenticate('alice*)(uid=*)', 'correct-password')).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });
  it('신뢰 CA가 없으면 평문 전환 없이 서비스 장애로 처리한다', async () => {
    const unsafe = { ...config('ldap'), ca: undefined };
    await expect(new LdapAuthenticator(unsafe).authenticate('alice', 'correct-password')).rejects.toMatchObject({ code: 'AUTH_SERVICE_UNAVAILABLE' });
  });
});
