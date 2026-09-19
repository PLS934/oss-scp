import { describe, expect, it } from 'vitest';
import { AuthenticationError, escapeLdapFilterValue, LdapAuthenticator } from '../dist/ldap-authenticator.js';

const config = { url: 'ldaps://ldap.example.com:636', bindDn: 'cn=service', bindPassword: 'service-secret', searchBaseDn: 'ou=users', searchFilter: '(uid={{login}})', userIdAttribute: 'entryUUID', timeoutMs: 5000 };

function clients(entries = [{ dn: 'uid=alice,ou=users', entryUUID: Buffer.from([1, 2, 3]) }], userBindError) {
  const calls = [];
  const made = [];
  const factory = options => {
    const index = made.length;
    const client = {
      startTLS: async tls => { calls.push(['startTLS', index, tls]); },
      bind: async (dn, password) => { calls.push(['bind', index, dn, password]); if (dn !== config.bindDn && userBindError) throw userBindError; },
      search: async (base, options) => { calls.push(['search', index, base, options]); return { searchEntries: entries }; },
      unbind: async () => { calls.push(['unbind', index]); },
    };
    made.push({ options, client }); return client;
  };
  return { calls, made, factory };
}

describe('LDAP 필터 escaping', () => {
  it('RFC 4515 특수문자를 escaping한다', () => expect(escapeLdapFilterValue('a*()\\\0z')).toBe('a\\2a\\28\\29\\5c\\00z'));
});

describe('LDAP 인증 제공자', () => {
  it('LDAPS 검색 뒤 사용자 DN으로 bind하고 binary ID를 정규화한다', async () => {
    const fake = clients();
    await expect(new LdapAuthenticator(config, fake.factory).authenticate(' alice ', 'password')).resolves.toEqual({ userId: 'AQID', loginId: 'alice' });
    expect(fake.calls.filter(call => call[0] === 'startTLS')).toHaveLength(0);
    expect(fake.made[0].options.tlsOptions).toEqual({ rejectUnauthorized: true, servername: 'ldap.example.com' });
    expect(fake.calls.find(call => call[0] === 'search')[3]).toMatchObject({ filter: '(uid=alice)', sizeLimit: 2, explicitBufferAttributes: ['entryUUID'] });
    expect(fake.calls).toContainEqual(['bind', 0, 'uid=alice,ou=users', 'password']);
    expect(fake.calls.filter(call => call[0] === 'unbind')).toHaveLength(1);
  });
  it('ldap URL에서는 StartTLS 뒤에만 bind하고 CA를 전달한다', async () => {
    const fake = clients();
    const auth = new LdapAuthenticator({ ...config, url: 'ldap://ldap.example.com:389', ca: 'PEM' }, fake.factory);
    await auth.authenticate('alice', 'password');
    const tlsAt = fake.calls.findIndex(call => call[0] === 'startTLS');
    const binds = fake.calls.map((call, index) => [call, index]).filter(([call]) => call[0] === 'bind');
    expect(tlsAt).toBeGreaterThanOrEqual(0);
    expect(binds).toHaveLength(2);
    expect(binds.every(([, index]) => index > tlsAt)).toBe(true);
    expect(fake.calls[tlsAt][2]).toEqual({ rejectUnauthorized: true, servername: 'ldap.example.com', ca: 'PEM' });
  });
  it('대소문자가 섞인 LDAP URL에서도 StartTLS를 모든 bind보다 먼저 수행한다', async () => {
    const fake = clients();
    const auth = new LdapAuthenticator({ ...config, url: 'LdAp://LDAP.EXAMPLE.COM:389' }, fake.factory);
    await auth.authenticate('alice', 'password');
    const tlsAt = fake.calls.findIndex(call => call[0] === 'startTLS');
    const bindIndexes = fake.calls.flatMap((call, index) => call[0] === 'bind' ? [index] : []);
    expect(tlsAt).toBeGreaterThanOrEqual(0);
    expect(bindIndexes).toHaveLength(2);
    expect(bindIndexes.every(index => index > tlsAt)).toBe(true);
  });
  it('대소문자가 섞인 LDAPS URL에서는 StartTLS를 중복 수행하지 않는다', async () => {
    const fake = clients();
    const auth = new LdapAuthenticator({ ...config, url: 'LdApS://LDAP.EXAMPLE.COM:636' }, fake.factory);
    await auth.authenticate('alice', 'password');
    expect(fake.calls.filter(call => call[0] === 'startTLS')).toHaveLength(0);
    expect(fake.calls.filter(call => call[0] === 'bind')).toHaveLength(2);
  });
  it.each([[[]], [[{ dn: 'one', entryUUID: '1' }, { dn: 'two', entryUUID: '2' }]]])('검색 결과 %# 를 일반화된 실패로 처리한다', async entries => {
    const fake = clients(entries);
    await expect(new LdapAuthenticator(config, fake.factory).authenticate('alice', 'password')).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(fake.made).toHaveLength(1);
  });
  it('필터 입력을 escaping하고 문자열 ID를 지원한다', async () => {
    const fake = clients([{ dn: 'uid=safe', entryUUID: ['stable-id'] }]);
    await expect(new LdapAuthenticator(config, fake.factory).authenticate('a*)(uid=*)', 'password')).resolves.toMatchObject({ userId: 'stable-id' });
    expect(fake.calls.find(call => call[0] === 'search')[3].filter).toBe('(uid=a\\2a\\29\\28uid=\\2a\\29)');
  });
  it('사용자 bind 거부와 LDAP 장애를 구분하고 연결을 닫는다', async () => {
    const invalid = Object.assign(new Error('no'), { name: 'InvalidCredentialsError' });
    const fakeInvalid = clients(undefined, invalid);
    await expect(new LdapAuthenticator(config, fakeInvalid.factory).authenticate('alice', 'wrong')).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(fakeInvalid.calls.filter(call => call[0] === 'unbind')).toHaveLength(1);
    const unavailable = clients(undefined, new Error('socket secret'));
    await expect(new LdapAuthenticator(config, unavailable.factory).authenticate('alice', 'password')).rejects.toMatchObject({ code: 'AUTH_SERVICE_UNAVAILABLE' });
  });
  it('잘못된 입력과 누락된 ID를 LDAP 상세 없이 거부한다', async () => {
    const fake = clients([{ dn: 'uid=alice' }]);
    for (const [login, password] of [['', 'x'], ['alice\0admin', 'x'], ['alice', '']]) {
      await expect(new LdapAuthenticator(config, fake.factory).authenticate(login, password)).rejects.toBeInstanceOf(AuthenticationError);
    }
    await expect(new LdapAuthenticator(config, fake.factory).authenticate('alice', 'password')).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });
  it.each([
    ['문자열', 'x'.repeat(513)],
    ['binary', Buffer.alloc(385)],
  ])('DB 계약보다 긴 %s 사용자 ID를 일반화된 실패로 처리한다', async (_kind, userId) => {
    const fake = clients([{ dn: 'uid=alice', entryUUID: userId }]);
    await expect(new LdapAuthenticator(config, fake.factory).authenticate('alice', 'password')).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(fake.calls.filter(call => call[0] === 'bind')).toEqual([['bind', 0, config.bindDn, config.bindPassword]]);
  });
});
