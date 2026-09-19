import { createHmac } from 'node:crypto';

interface Bucket { count: number; resetAt: number }

export class LoginRateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  constructor(private readonly secret: string, private readonly limit = 10, private readonly windowMs = 300_000) {}

  private loginKey(loginId: string): string { return `login:${createHmac('sha256', this.secret).update(loginId.trim().toLocaleLowerCase('en-US')).digest('hex')}`; }
  private consume(key: string, now: number): number | null {
    const current = this.buckets.get(key);
    if (!current || current.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      return null;
    }
    if (current.count >= this.limit) return Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    current.count += 1;
    return null;
  }

  check(ip: string, loginId: string, now = Date.now()): number | null {
    this.prune(now);
    const ipRetry = this.consume(`ip:${ip}`, now);
    const loginRetry = this.consume(this.loginKey(loginId), now);
    return Math.max(ipRetry ?? 0, loginRetry ?? 0) || null;
  }
  success(loginId: string) { this.buckets.delete(this.loginKey(loginId)); }
  private prune(now: number) { for (const [key, bucket] of this.buckets) if (bucket.resetAt <= now) this.buckets.delete(key); }
  /** 테스트·진단에서 원문 식별자를 보관하지 않는지 확인하기 위한 크기 전용 snapshot. */
  keys(): readonly string[] { return [...this.buckets.keys()]; }
}
