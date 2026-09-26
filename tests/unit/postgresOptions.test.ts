import { describe, expect, it } from 'vitest';
import { sslOptionFor } from '@/lib/db/postgres';

describe('sslOptionFor', () => {
  it('disables TLS for localhost', () => {
    expect(sslOptionFor('postgresql://user:pass@localhost:5432/db')).toBe(false);
  });
  it('disables TLS for 127.0.0.1', () => {
    expect(sslOptionFor('postgresql://user:pass@127.0.0.1:5432/db')).toBe(false);
  });
  it('disables TLS for the IPv6 loopback address', () => {
    expect(sslOptionFor('postgresql://user:pass@[::1]:5432/db')).toBe(false);
  });
  it('requires TLS for a remote host', () => {
    expect(sslOptionFor('postgresql://user:pass@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres')).toBe(
      'require',
    );
  });
  it('respects an explicit sslmode=disable on a remote host', () => {
    expect(
      sslOptionFor('postgresql://user:pass@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?sslmode=disable'),
    ).toBe(false);
  });
  it('requires TLS for a remote host with an unrelated query param', () => {
    expect(sslOptionFor('postgresql://user:pass@example.com:5432/db?sslmode=require')).toBe('require');
  });
});
