import { createHmac } from 'node:crypto';

interface Bucket { count: number; pending: number; resetAt: number }

export type LoginRateLimitReservation =
  | { kind: 'limited'; retryAfter: number }
  | { kind: 'reserved'; commit(): void; release(): void };

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
    this.buckets.set(key, { count: 1, pending: 0, resetAt: now + this.windowMs });
    return null;
  }

  private reserveBucket(key: string, now: number): number {
    const current = this.buckets.get(key);
    if (current && current.resetAt > now) {
      current.count += 1;
      current.pending += 1;
      return current.resetAt;
    }
    const resetAt = now + this.windowMs;
    this.buckets.set(key, { count: 1, pending: 1, resetAt });
    return resetAt;
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
  reserve(ip: string, loginId: string, now = Date.now()): LoginRateLimitReservation {
    this.prune(now);
    const ipKey = `ip:${ip}`;
    const loginKey = this.loginKey(loginId);
    const ipRetry = this.retryAfter(ipKey, now);
    if (ipRetry !== null) return { kind: 'limited', retryAfter: ipRetry };
    const loginRetry = this.retryAfter(loginKey, now);
    if (loginRetry !== null) return { kind: 'limited', retryAfter: loginRetry };

    const requiredBuckets = Number(!this.buckets.has(ipKey)) + Number(!this.buckets.has(loginKey));
    if (this.buckets.size + requiredBuckets > this.maxBuckets) {
      return { kind: 'limited', retryAfter: Math.max(1, Math.ceil(this.windowMs / 1000)) };
    }

    const ipResetAt = this.reserveBucket(ipKey, now);
    const loginResetAt = this.reserveBucket(loginKey, now);
    let settled = false;
    return {
      kind: 'reserved',
      commit: () => {
        if (settled) return;
        settled = true;
        this.settle(ipKey, ipResetAt, true);
        this.settle(loginKey, loginResetAt, true);
      },
      release: () => {
        if (settled) return;
        settled = true;
        this.settle(ipKey, ipResetAt, false);
        this.settle(loginKey, loginResetAt, false);
      },
    };
  }
  success(loginId: string) {
    const loginKey = this.loginKey(loginId);
    const current = this.buckets.get(loginKey);
    if (!current) return;
    current.count = current.pending;
    if (current.count === 0) this.buckets.delete(loginKey);
  }
  private settle(key: string, resetAt: number, keep: boolean) {
    const current = this.buckets.get(key);
    if (!current || current.resetAt !== resetAt) return;
    current.pending -= 1;
    if (!keep) current.count -= 1;
    if (current.count === 0) this.buckets.delete(key);
  }
  private prune(now: number) {
    for (const [key, bucket] of this.buckets) if (bucket.resetAt <= now) this.buckets.delete(key);
  }
  /** 테스트·진단에서 원문 식별자를 보관하지 않는지 확인하기 위한 크기 전용 snapshot. */
  keys(): readonly string[] { return [...this.buckets.keys()]; }
}
