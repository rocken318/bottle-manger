import { beforeAll, describe, expect, it } from 'vitest';
import { signSession, verifySession } from '@/lib/auth/session';

beforeAll(() => {
  process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-0123';
});

describe('session', () => {
  it('round-trips the staff id', async () => {
    const token = await signSession('staff-1');
    expect(await verifySession(token)).toBe('staff-1');
  });
  it('rejects a tampered token', async () => {
    const token = await signSession('staff-1');
    const otherToken = await signSession('staff-2');
    const [, otherPayload] = otherToken.split('.');
    const [header, , signature] = token.split('.');
    const tampered = `${header}.${otherPayload}.${signature}`;
    expect(await verifySession(tampered)).toBeNull();
  });
  it('rejects garbage', async () => {
    expect(await verifySession('not-a-jwt')).toBeNull();
  });
  it('throws (not returns null) when SESSION_SECRET is misconfigured', async () => {
    const original = process.env.SESSION_SECRET;
    delete process.env.SESSION_SECRET;
    try {
      await expect(verifySession('anything')).rejects.toThrow('SESSION_SECRET must be at least 32 characters');
    } finally {
      process.env.SESSION_SECRET = original;
    }
  });
});
