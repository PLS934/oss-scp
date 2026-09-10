import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, symlinkSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rootCertificates } from 'node:tls';
import { format } from 'node:util';
import { readPlatformDbConfig, selectPlatformDbAdapter, PlatformDbConfigError } from '../dist/index.js';

const postgres = { id: 'postgres', contractVersion: 1, defaultPort: 5432, connect: vi.fn() };
const mysql = { ...postgres, id: 'mysql', defaultPort: 3306 };
const base = {
  PLATFORM_DB_TYPE: 'postgres', PLATFORM_DB_HOST: 'localhost',
  PLATFORM_DB_NAME: 'oss_scp', PLATFORM_DB_USER: 'app', PLATFORM_DB_PASSWORD: 'sample password',
};
const read = (patch = {}, adapters = [postgres, mysql]) => readPlatformDbConfig({ ...base, ...patch }, adapters);
const dirs = [];
function file(content) {
  const dir = mkdtempSync(join(tmpdir(), 'platform-db-test-'));
  dirs.push(dir);
  const path = join(dir, 'config');
  writeFileSync(path, content);
  return path;
}
function withPasswordFile(path) { return { PLATFORM_DB_PASSWORD: undefined, PLATFORM_DB_PASSWORD_FILE: path }; }
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); vi.clearAllMocks(); });
function failure(fn, code, setting) {
  try { fn(); } catch (error) {
    expect(error).toBeInstanceOf(PlatformDbConfigError);
    expect(error.code).toBe(code);
    if (setting) expect(error.setting).toBe(setting);
    return error;
  }
  throw new Error('설정 오류가 필요합니다.');
}

describe('접속 설정', () => {
  it('기본값·제품별 포트를 반환하고 입력 변경이나 연결을 하지 않는다', () => {
    expect(read()).toEqual({ type: 'postgres', host: 'localhost', database: 'oss_scp', user: 'app', password: 'sample password', port: 5432, poolMax: 10, connectTimeoutMs: 5000, tls: { mode: 'verify-full' } });
    expect(read({ PLATFORM_DB_TYPE: 'mysql' }).port).toBe(3306);
    expect(postgres.connect).not.toHaveBeenCalled();
    expect(base.PLATFORM_DB_PORT).toBeUndefined();
  });
  it('명시적 설정과 경계값을 받는다', () => {
    expect(read({ PLATFORM_DB_PORT: '65535', PLATFORM_DB_POOL_MAX: '100', PLATFORM_DB_CONNECT_TIMEOUT_MS: '60000', PLATFORM_DB_TLS_MODE: 'disable' })).toMatchObject({ port: 65535, poolMax: 100, connectTimeoutMs: 60000, tls: { mode: 'disable' } });
    expect(read({ PLATFORM_DB_PORT: '1', PLATFORM_DB_POOL_MAX: '1', PLATFORM_DB_CONNECT_TIMEOUT_MS: '1' })).toMatchObject({ port: 1, poolMax: 1, connectTimeoutMs: 1 });
  });
  it.each(['PLATFORM_DB_TYPE', 'PLATFORM_DB_HOST', 'PLATFORM_DB_NAME', 'PLATFORM_DB_USER'])('%s 필수값을 검사한다', key => {
    failure(() => read({ [key]: undefined }), 'REQUIRED', key);
    for (const value of ['', ' ', ' name', 'name ', 'a\nb']) failure(() => read({ [key]: value }), 'INVALID_TEXT', key);
  });
  it.each(['https://db', 'postgres://db', '//db'])('URL 주소 %s를 거부한다', host => failure(() => read({ PLATFORM_DB_HOST: host }), 'INVALID_TEXT'));
  it.each(['127.0.0.1', '::1', 'db.internal'])('호스트 %s를 받는다', host => expect(read({ PLATFORM_DB_HOST: host }).host).toBe(host));
  for (const [key, code, max] of [['PLATFORM_DB_PORT', 'INVALID_PORT', 65535], ['PLATFORM_DB_POOL_MAX', 'INVALID_POOL_MAX', 100], ['PLATFORM_DB_CONNECT_TIMEOUT_MS', 'INVALID_TIMEOUT', 60000]]) {
    it.each(['', '0', '-1', '+1', '1.5', '1e2', ' 10', '10 ', 'abc', String(max + 1), '9'.repeat(400)])(`${key}=%s 거부`, raw => failure(() => read({ [key]: raw }), code, key));
  }
  it('전체 설정 누락은 비활성화로 간주하지 않는다', () => failure(() => readPlatformDbConfig({}, [postgres]), 'REQUIRED'));
});

describe('비밀번호', () => {
  it('직접 값의 공백을 보존한다', () => expect(read({ PLATFORM_DB_PASSWORD: '  secret  ' }).password).toBe('  secret  '));
  it.each(['', '\n', 'a\nb', 'a\rb', 'a\0b', 'x'.repeat(16385)])('잘못된 직접 값 %# 거부', value => failure(() => read({ PLATFORM_DB_PASSWORD: value }), 'INVALID_PASSWORD'));
  it('직접 값의 바이트 한도를 적용한다', () => {
    expect(read({ PLATFORM_DB_PASSWORD: 'x'.repeat(16384) }).password.length).toBe(16384);
    failure(() => read({ PLATFORM_DB_PASSWORD: '가'.repeat(6000) }), 'INVALID_PASSWORD');
  });
  it('두 방식 동시 지정과 누락을 거부한다', () => {
    failure(() => read({ PLATFORM_DB_PASSWORD: undefined }), 'PASSWORD_SOURCE');
    failure(() => read({ PLATFORM_DB_PASSWORD_FILE: '/missing' }), 'PASSWORD_SOURCE');
    failure(() => read({ PLATFORM_DB_PASSWORD: '', PLATFORM_DB_PASSWORD_FILE: '' }), 'PASSWORD_SOURCE');
  });
  it.each([' secret ', ' secret \n', ' secret \r\n'])('파일 마지막 개행만 제거 %#', value => expect(read(withPasswordFile(file(value))).password).toBe(' secret '));
  it.each(['a\n\n', 'a\r', 'a\0b', '\n'])('잘못된 파일 비밀번호 %# 거부', value => failure(() => read(withPasswordFile(file(value))), 'INVALID_PASSWORD'));
  it.each(['', Buffer.from([0xff]), 'x'.repeat(16385)])('빈/잘못된 UTF-8/초과 파일 %# 거부', value => failure(() => read(withPasswordFile(file(value))), 'INVALID_FILE'));
  it('정확히 한도인 파일과 BOM 값을 보존한다', () => {
    expect(read(withPasswordFile(file('x'.repeat(16384)))).password.length).toBe(16384);
    expect(read(withPasswordFile(file('\ufeffsecret'))).password).toBe('\ufeffsecret');
  });
  it('상대 경로·없는 파일·디렉터리 거부', () => {
    for (const path of ['relative', '', '/missing-secret-file', tmpdir()]) failure(() => read(withPasswordFile(path)), 'INVALID_FILE');
  });
  it.skipIf(process.getuid?.() === 0 || process.platform === 'win32')('권한 없는 파일 거부', () => {
    const path = file('secret'); chmodSync(path, 0);
    try { failure(() => read(withPasswordFile(path)), 'INVALID_FILE'); } finally { chmodSync(path, 0o600); }
  });
  it('secret 마운트용 심볼릭 링크를 지원한다', () => {
    const path = file('secret\n'); const link = `${path}-link`; symlinkSync(path, link);
    expect(read(withPasswordFile(link)).password).toBe('secret');
  });
});

describe('TLS', () => {
  it.each(['', 'require', 'false'])('잘못된 모드 %s 거부', value => failure(() => read({ PLATFORM_DB_TLS_MODE: value }), 'INVALID_TLS'));
  it('평문 모드와 CA 지정 충돌', () => failure(() => read({ PLATFORM_DB_TLS_MODE: 'disable', PLATFORM_DB_TLS_CA_FILE: '/missing' }), 'TLS_CA_CONFLICT'));
  it('CA 인증서와 번들을 읽는다', () => {
    for (const ca of [rootCertificates[0], rootCertificates.slice(0, 2).join('\n')]) expect(read({ PLATFORM_DB_TLS_CA_FILE: file(ca) }).tls).toEqual({ mode: 'verify-full', ca });
  });
  it.each(['not a certificate', '-----BEGIN CERTIFICATE-----\ninvalid\n-----END CERTIFICATE-----'])('잘못된 PEM %# 거부', ca => failure(() => read({ PLATFORM_DB_TLS_CA_FILE: file(ca) }), 'INVALID_CA'));
  it('유효한 인증서 뒤 잘못된 내용도 거부한다', () => failure(() => read({ PLATFORM_DB_TLS_CA_FILE: file(rootCertificates[0] + '\ninvalid') }), 'INVALID_CA'));
  it('CA 파일의 경로·내용·크기를 검사한다', () => {
    for (const path of ['', 'relative', '/missing-ca', file(''), file(Buffer.from([0xff])), file('x'.repeat(1048577))]) failure(() => read({ PLATFORM_DB_TLS_CA_FILE: path }), 'INVALID_FILE');
  });
});

describe('어댑터 등록과 오류 공개', () => {
  it('중복·잘못된 등록을 거부한다', () => {
    failure(() => read({}, [postgres, postgres]), 'DUPLICATE_ADAPTER');
    for (const patch of [{ id: '' }, { id: ' bad' }, { id: 'bad\n' }, { contractVersion: 2 }, { defaultPort: 0 }, { defaultPort: 65536 }, { defaultPort: 1.5 }, { connect: undefined }]) failure(() => read({}, [{ ...postgres, ...patch }]), 'INVALID_ADAPTER');
    failure(() => read({}, [null]), 'INVALID_ADAPTER');
  });
  it('미등록 제품은 파일 읽기 전에 거부하고 모듈을 실행하지 않는다', () => {
    const error = failure(() => read({ ...withPasswordFile('/missing-secret'), PLATFORM_DB_TYPE: '/tmp/unsafe-module' }), 'UNREGISTERED_ADAPTER');
    expect(error.setting).toBe('PLATFORM_DB_TYPE');
    expect(postgres.connect).not.toHaveBeenCalled();
    failure(() => read({}, []), 'UNREGISTERED_ADAPTER');
  });
  it('서버와 CLI가 같은 계약으로 가짜 연결을 사용할 수 있다', async () => {
    const factory = { ...postgres, connect: vi.fn(async () => { let closed = false; return { checkReady: async () => !closed, close: async () => { closed = true; } }; }) };
    async function consume(env) {
      const config = readPlatformDbConfig(env, [factory]);
      const connection = await selectPlatformDbAdapter(config.type, [factory]).connect(config);
      expect(await connection.checkReady()).toBe(true);
      await connection.close(); await connection.close();
      expect(await connection.checkReady()).toBe(false);
      return config;
    }
    expect(await consume(base)).toEqual(await consume({ ...base }));
    expect(factory.connect).toHaveBeenCalledTimes(2);
  });
  it('공개 오류의 출력 어디에도 입력값·경로·원본 오류가 포함되지 않는다', () => {
    const marker = 'sensitive-marker-123';
    const errors = [
      failure(() => read({ PLATFORM_DB_PORT: marker }), 'INVALID_PORT'),
      failure(() => read(withPasswordFile(`/missing/${marker}`)), 'INVALID_FILE'),
      failure(() => read(withPasswordFile(file(`${marker}\0`))), 'INVALID_PASSWORD'),
      failure(() => read({ PLATFORM_DB_TLS_CA_FILE: file(marker) }), 'INVALID_CA'),
      failure(() => read({ PLATFORM_DB_TYPE: marker }), 'UNREGISTERED_ADAPTER'),
    ];
    for (const error of errors) {
      for (const rendered of [String(error), error.stack, JSON.stringify(error), format('%o', error)]) {
        expect(rendered).not.toContain(marker);
        expect(rendered).not.toContain('ENOENT');
        expect(rendered).not.toContain('/missing/');
      }
      expect(error.cause).toBeUndefined();
    }
  });
});
