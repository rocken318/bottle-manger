import { describe, expect, it } from 'vitest';
import { assertProductionEnv, register } from '@/instrumentation';

describe('assertProductionEnv', () => {
  it('throws when SESSION_SECRET is missing', () => {
    expect(() => assertProductionEnv({ DATABASE_URL: 'postgresql://x' })).toThrow(/SESSION_SECRET/);
  });
  it('throws when SESSION_SECRET is shorter than 32 chars', () => {
    expect(() =>
      assertProductionEnv({ SESSION_SECRET: 'short', DATABASE_URL: 'postgresql://x' }),
    ).toThrow(/SESSION_SECRET/);
  });
  it('throws when DATABASE_URL is missing', () => {
    expect(() =>
      assertProductionEnv({ SESSION_SECRET: 'a'.repeat(32) }),
    ).toThrow(/DATABASE_URL/);
  });
  it('passes when both are valid', () => {
    expect(() =>
      assertProductionEnv({ SESSION_SECRET: 'a'.repeat(32), DATABASE_URL: 'postgresql://x' }),
    ).not.toThrow();
  });
});

describe('register', () => {
  it('does nothing outside the nodejs production runtime', async () => {
    // vitest runs with NODE_ENV=test, so register() must be a no-op here even though the
    // required env vars below are missing.
    const originalSecret = process.env.SESSION_SECRET;
    const originalDbUrl = process.env.DATABASE_URL;
    const originalRuntime = process.env.NEXT_RUNTIME;
    delete process.env.SESSION_SECRET;
    delete process.env.DATABASE_URL;
    process.env.NEXT_RUNTIME = 'nodejs';
    try {
      await expect(register()).resolves.toBeUndefined();
    } finally {
      process.env.SESSION_SECRET = originalSecret;
      process.env.DATABASE_URL = originalDbUrl;
      process.env.NEXT_RUNTIME = originalRuntime;
    }
  });
});
