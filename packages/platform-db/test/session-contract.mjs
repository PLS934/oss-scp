import { expect } from 'vitest';

export async function verifyAuthSessionRepository(repository, prefix) {
  const now = new Date('2026-09-19T00:00:00.000Z');
  const valid = { sessionHash: `${prefix}a`.padEnd(64, 'a').slice(0, 64), userId: 'user-1', loginId: 'alice', createdAt: new Date(now.getTime() - 1000), expiresAt: new Date(now.getTime() + 60_000) };
  const expired = { sessionHash: `${prefix}b`.padEnd(64, 'b').slice(0, 64), userId: 'user-2', loginId: 'bob', createdAt: new Date(now.getTime() - 60_000), expiresAt: new Date(now.getTime() - 1000) };
  await repository.create(valid);
  await repository.create(expired);
  await expect(repository.findValid(valid.sessionHash, now)).resolves.toEqual(valid);
  await expect(repository.findValid(expired.sessionHash, now)).resolves.toBeNull();
  await expect(repository.findValid(expired.sessionHash, now)).resolves.toBeNull();
  await repository.delete(valid.sessionHash);
  await expect(repository.findValid(valid.sessionHash, now)).resolves.toBeNull();

  for (let index = 0; index < 3; index++) await repository.create({ ...expired, sessionHash: `${prefix}${index}`.padEnd(64, 'c').slice(0, 64) });
  expect(await repository.deleteExpired(now, 2)).toBe(2);
  expect(await repository.deleteExpired(now, 2)).toBe(1);
  await expect(repository.deleteExpired(now, 0)).rejects.toThrow(RangeError);
}
