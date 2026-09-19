import { createHmac } from 'node:crypto';

interface Bucket { count: number; resetAt: number }

export class LoginRateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  constructor(
    private readonly secret: string,
    private readonly limit = 10,
    private readonly windowMs = 300_000,
    private readonly maxBuckets = 10_000,
  ) {
    if (!Number.isSafeInteger(maxBuckets) || maxBuckets < 2) throw new Error('maxBuckets must be at least 2');
  }

  private loginKey(loginId: string): string { return `login:${createHmac('sha256', this.secret).update(loginId.trim().toLocaleLowerCase('en-US')).digest('hex')}`; }
  private retryAfter(key: string, now: number): number | null {
    const current = this.buckets.get(key);
    if (!current || current.resetAt <= now || current.count < this.limit) return null;
    return Math.max(1, Math.ceil((current.resetAt - now) / 1000));
  }
  private consume(key: string, now: number): number | null {
    const retryAfter = this.retryAfter(key, now);
    if (retryAfter !== null) return retryAfter;
    const current = this.buckets.get(key);
    if (current && current.resetAt > now) {
      current.count += 1;
      return null;
    }
    if (this.buckets.size >= this.maxBuckets) {
      return Math.max(1, Math.ceil(this.windowMs / 1000));
    }
    this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
    return null;
  }

  check(ip: string, loginId: string, now = Date.now()): number | null {
    this.prune(now);
    const ipKey = `ip:${ip}`;
    const loginKey = this.loginKey(loginId);
    const ipRetry = this.retryAfter(ipKey, now);
    if (ipRetry !== null) return ipRetry;
    const loginRetry = this.retryAfter(loginKey, now);
    if (loginRetry !== null) return loginRetry;
    const requiredBuckets = Number(!this.buckets.has(ipKey)) + Number(!this.buckets.has(loginKey));
    return this.buckets.size + requiredBuckets > this.maxBuckets ? Math.max(1, Math.ceil(this.windowMs / 1000)) : null;
  }
  failure(ip: string, loginId: string, now = Date.now()): number | null {
    this.prune(now);
    const ipRetry = this.consume(`ip:${ip}`, now);
    if (ipRetry !== null) return ipRetry;
    return this.consume(this.loginKey(loginId), now);
  }
  success(loginId: string) { this.buckets.delete(this.loginKey(loginId)); }
  private prune(now: number) {
    for (const [key, bucket] of this.buckets) if (bucket.resetAt <= now) this.buckets.delete(key);
  }
  /** 테스트·진단에서 원문 식별자를 보관하지 않는지 확인하기 위한 크기 전용 snapshot. */
  keys(): readonly string[] { return [...this.buckets.keys()]; }
}
