import { describe, expect, it, vi } from 'vitest';
import { connectAfterAuthValidation } from '../dist/startup-auth.js';

describe('인증 설정 초기화 순서', () => {
  it('잘못된 인증 설정이면 DB 연결을 시작하지 않는다', async () => {
    const connect = vi.fn(async () => ({ close: vi.fn() }));

    await expect(connectAfterAuthValidation(connect, {
      AUTH_ENABLED: 'true',
    })).rejects.toThrow('LDAP_URL');

    expect(connect).not.toHaveBeenCalled();
  });
});
