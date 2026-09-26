/**
 * Fails fast at server startup instead of misbehaving quietly at runtime:
 * - a missing/too-short SESSION_SECRET would otherwise make verifySession's underlying
 *   secretKey() throw on the first request, or (previously) silently look like "logged out".
 * - a missing DATABASE_URL would otherwise surface as an opaque error on the first query.
 */
export function assertProductionEnv(env: Record<string, string | undefined> = process.env): void {
  const secret = env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET is missing or shorter than 32 characters. Set it before starting in production.');
  }
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL is missing. Set it before starting in production.');
  }
}

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.NODE_ENV === 'production') {
    assertProductionEnv();
  }
}
