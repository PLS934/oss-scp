import { Body, Controller, Get, HttpException, Post, Req, Res } from '@nestjs/common';
import { AuthService } from './auth.service';
import { expiredSessionCookie, parseSessionCookie, sessionCookie } from './auth-session';
import { AuthenticationError } from './ldap-authenticator';

function error(status: number, code: string, message: string): never {
  throw new HttpException({ code, message }, status);
}

interface HttpRequest { ip?: string; socket: { remoteAddress?: string }; headers: { cookie?: string } }
interface HttpResponse { setHeader(name: string, value: string): void }
function remoteIp(request: HttpRequest): string { return request.ip || request.socket.remoteAddress || 'unknown'; }

@Controller('/api/v1/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get('/session')
  async current(@Req() request: HttpRequest) {
    if (!this.auth.enabled) return { enabled: false };
    const current = await this.auth.session(parseSessionCookie(request.headers.cookie));
    return current ? { enabled: true, authenticated: true, user: { loginId: current.loginId } } : { enabled: true, authenticated: false };
  }

  @Post('/login')
  async login(@Body() body: unknown, @Req() request: HttpRequest, @Res({ passthrough: true }) response: HttpResponse) {
    if (!this.auth.enabled) error(404, 'AUTH_DISABLED', '인증이 비활성화되어 있습니다.');
    const input = body && typeof body === 'object' ? body as Record<string, unknown> : {};
    const loginId = typeof input.loginId === 'string' ? input.loginId : '';
    const password = typeof input.password === 'string' ? input.password : '';
    try {
      const result = await this.auth.login(remoteIp(request), loginId, password);
      if (result.kind === 'limited') {
        response.setHeader('Retry-After', String(result.retryAfter));
        error(429, 'TOO_MANY_ATTEMPTS', '로그인 시도가 너무 많습니다. 잠시 후 다시 시도하세요.');
      }
      response.setHeader('Set-Cookie', sessionCookie(result.sessionId, this.auth.ttlSeconds, this.auth.secureCookie));
      return { authenticated: true, user: { loginId: result.identity.loginId }, expiresAt: result.expiresAt.toISOString() };
    } catch (caught) {
      const code = caught instanceof AuthenticationError ? caught.code
        : caught && typeof caught === 'object' && 'code' in caught ? (caught as { code?: unknown }).code : undefined;
      if (code === 'INVALID_CREDENTIALS') error(401, code, '로그인 정보를 확인하세요.');
      if (code === 'AUTH_SERVICE_UNAVAILABLE') {
        error(503, code, '인증 서비스를 사용할 수 없습니다.');
      }
      throw caught;
    }
  }

  @Post('/logout')
  async logout(@Req() request: HttpRequest, @Res({ passthrough: true }) response: HttpResponse) {
    await this.auth.logout(parseSessionCookie(request.headers.cookie));
    response.setHeader('Set-Cookie', expiredSessionCookie(this.auth.secureCookie));
    return { ok: true };
  }
}
