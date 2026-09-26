import { describe, expect, it } from 'vitest';
import { MAX_PIN_ATTEMPTS, mayVerify, shouldLockAfterFailure } from '@/lib/auth/lockout';

describe('lockout', () => {
  it('allows verification up to the fifth attempt', () => {
    expect(MAX_PIN_ATTEMPTS).toBe(5);
    expect(mayVerify(5)).toBe(true);
    expect(mayVerify(6)).toBe(false);
  });
  it('locks after the fifth failure', () => {
    expect(shouldLockAfterFailure(4)).toBe(false);
    expect(shouldLockAfterFailure(5)).toBe(true);
  });
});
