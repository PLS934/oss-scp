import { CanActivate, ExecutionContext, HttpException, Injectable } from '@nestjs/common';
import { AuthService } from './auth.service';
import { parseSessionCookie } from './auth-session';

const PUBLIC = new Set([
  'GET /api/v1/health', 'GET /api/v1/ready', 'GET /api/v1/auth/session',
  'POST /api/v1/auth/login', 'POST /api/v1/auth/logout',
]);
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
interface HttpRequest { method: string; originalUrl: string; headers: { cookie?: string; origin?: string; host?: string }; authUser?: { userId: string; loginId: string } }

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.auth.enabled) return true;
    const request = context.switchToHttp().getRequest<HttpRequest>();
    const path = request.originalUrl.split('?')[0];
    const sessionId = parseSessionCookie(request.headers.cookie);
    if (sessionId && !SAFE_METHODS.has(request.method)) {
      const origin = request.headers.origin;
      if (origin) {
        let originHost: string;
        try { originHost = new URL(origin).host; } catch { throw new HttpException({ code: 'ORIGIN_REJECTED', message: '요청 출처를 확인하세요.' }, 403); }
        if (originHost !== request.headers.host) throw new HttpException({ code: 'ORIGIN_REJECTED', message: '요청 출처를 확인하세요.' }, 403);
      }
    }
    if (PUBLIC.has(`${request.method} ${path}`)) return true;
    const current = await this.auth.session(sessionId);
    if (!current) throw new HttpException({ code: 'AUTH_REQUIRED', message: '로그인이 필요합니다.' }, 401);
    request.authUser = { userId: current.userId, loginId: current.loginId };
    return true;
  }
}
