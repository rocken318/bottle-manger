import { describe, expect, it } from 'vitest';
import { hashPin, isValidPin, verifyPin } from '@/lib/auth/pin';

describe('pin', () => {
  it('accepts only 4-6 digits', () => {
    expect(isValidPin('1234')).toBe(true);
    expect(isValidPin('123456')).toBe(true);
    expect(isValidPin('123')).toBe(false);
    expect(isValidPin('1234567')).toBe(false);
    expect(isValidPin('12a4')).toBe(false);
  });
  it('hashes and verifies', async () => {
    const hash = await hashPin('1234');
    expect(hash).not.toContain('1234');
    expect(await verifyPin('1234', hash)).toBe(true);
    expect(await verifyPin('4321', hash)).toBe(false);
  });
  it('refuses to hash an invalid PIN', async () => {
    await expect(hashPin('12')).rejects.toThrow('invalid_pin_format');
  });
});
