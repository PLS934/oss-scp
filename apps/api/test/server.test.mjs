import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { AppModule } from '../dist/app.module.js';
import { readConfig } from '../dist/config.js';

describe('HTTP 계약과 Nest 의존성 주입', () => {
  let app;
  let url;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    await app.listen(0, '127.0.0.1');
    url = await app.getUrl();
  });
  afterAll(async () => { await app?.close(); });
  it('인증 없이 정확한 상태 JSON을 반환한다', async () => {
    const response = await fetch(`${url}/api/v1/health`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual({ status: 'ok' });
  });
  it('정의되지 않은 경로는 404를 반환한다', async () => {
    expect((await fetch(`${url}/api/v1/missing`)).status).toBe(404);
  });
});

describe('실행 설정', () => {
  it('기본값과 사용자 설정을 사용한다', () => {
    expect(readConfig({})).toEqual({ host: '127.0.0.1', port: 3000 });
    expect(readConfig({ HOST: '0.0.0.0', PORT: '4321' })).toEqual({ host: '0.0.0.0', port: 4321 });
    expect(readConfig({ PORT: '65535' }).port).toBe(65535);
  });
  it.each(['', '0', '-1', '65536', '1.5', 'abc', '3000x', ' 3000', '1e3'])('잘못된 포트 %s를 거부한다', (PORT) => {
    expect(() => readConfig({ PORT })).toThrow('PORT');
  });
});
