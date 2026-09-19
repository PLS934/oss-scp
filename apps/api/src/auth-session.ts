import { createHmac, randomBytes } from 'node:crypto';
import type { AuthSessionRepository } from '@oss-scp/platform-db';
import type { AuthenticatedIdentity } from './ldap-authenticator';

export const SESSION_COOKIE = 'oss_scp_session';
const SESSION_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

export function sessionHash(secret: string, sessionId: string): string {
  return createHmac('sha256', secret).update(sessionId).digest('hex');
}

export function parseSessionCookie(header: string | undefined): string | null {
  if (!header) return null;
  const values = header.split(';').map(part => part.trim()).filter(part => part.startsWith(`${SESSION_COOKIE}=`));
  if (values.length !== 1) return null;
  const value = values[0].slice(SESSION_COOKIE.length + 1);
  return SESSION_PATTERN.test(value) ? value : null;
}

export function sessionCookie(value: string, ttlSeconds: number, secure: boolean): string {
  const parts = [`${SESSION_COOKIE}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${ttlSeconds}`];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function expiredSessionCookie(secure: boolean): string {
  return sessionCookie('', 0, secure) + '; Expires=Thu, 01 Jan 1970 00:00:00 GMT';
}

export class AuthSessionManager {
  constructor(private readonly repository: AuthSessionRepository, private readonly secret: string, private readonly ttlSeconds: number) {}

  async create(identity: AuthenticatedIdentity, now = new Date()): Promise<{ sessionId: string; expiresAt: Date }> {
    const sessionId = randomBytes(32).toString('base64url');
    const expiresAt = new Date(now.getTime() + this.ttlSeconds * 1000);
    await this.repository.create({ sessionHash: sessionHash(this.secret, sessionId), userId: identity.userId, loginId: identity.loginId, createdAt: now, expiresAt });
    await this.repository.deleteExpired(now, 100).catch(() => undefined);
    return { sessionId, expiresAt };
  }

  async find(sessionId: string, now = new Date()) { return this.repository.findValid(sessionHash(this.secret, sessionId), now); }
  async revoke(sessionId: string) { await this.repository.delete(sessionHash(this.secret, sessionId)); }
}
