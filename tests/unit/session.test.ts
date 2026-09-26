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
    expect(await verifySession(token.slice(0, -2) + 'xx')).toBeNull();
  });
  it('rejects garbage', async () => {
    expect(await verifySession('not-a-jwt')).toBeNull();
  });
});
