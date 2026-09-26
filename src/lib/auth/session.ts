import { jwtVerify, SignJWT } from 'jose';

export const SESSION_COOKIE = 'session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters');
  return new TextEncoder().encode(secret);
}

export async function signSession(staffId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(staffId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(secretKey());
}

/** Returns the staff id, or null when the token is invalid or expired. */
export async function verifySession(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ['HS256'] });
    return payload.sub ?? null;
  } catch {
    return null;
  }
}
