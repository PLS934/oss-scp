import { Inject, Injectable } from '@nestjs/common';
import type { AuthConfig } from './auth-config';
import { AuthSessionManager } from './auth-session';
import type { LdapAuthenticator } from './ldap-authenticator';
import { LoginRateLimiter } from './login-rate-limit';

export interface AuthRuntime {
  config: AuthConfig;
  authenticator?: LdapAuthenticator;
  sessions?: AuthSessionManager;
  rateLimiter?: LoginRateLimiter;
}

export const AUTH_RUNTIME = Symbol('AUTH_RUNTIME');

@Injectable()
export class AuthService {
  constructor(@Inject(AUTH_RUNTIME) readonly runtime: AuthRuntime) {}
  get enabled() { return this.runtime.config.enabled; }
  get secureCookie() { return this.runtime.config.enabled && this.runtime.config.session.secure; }
  get ttlSeconds() { return this.runtime.config.enabled ? this.runtime.config.session.ttlSeconds : 0; }

  async login(ip: string, loginId: string, password: string) {
    if (!this.runtime.config.enabled || !this.runtime.authenticator || !this.runtime.sessions || !this.runtime.rateLimiter) throw new Error('authentication disabled');
    const retryAfter = this.runtime.rateLimiter.check(ip, loginId);
    if (retryAfter !== null) return { kind: 'limited' as const, retryAfter };
    const identity = await this.runtime.authenticator.authenticate(loginId, password);
    this.runtime.rateLimiter.success(loginId);
    return { kind: 'success' as const, identity, ...(await this.runtime.sessions.create(identity)) };
  }

  async session(sessionId: string | null) {
    if (!this.runtime.config.enabled || !sessionId || !this.runtime.sessions) return null;
    return this.runtime.sessions.find(sessionId);
  }

  async logout(sessionId: string | null) {
    if (this.runtime.config.enabled && sessionId && this.runtime.sessions) await this.runtime.sessions.revoke(sessionId).catch(() => undefined);
  }
}
