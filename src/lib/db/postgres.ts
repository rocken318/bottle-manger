import postgres from 'postgres';
import type { Db } from './types';

type Sql = postgres.Sql | postgres.TransactionSql;

function wrap(sql: Sql, inTransaction: boolean): Db {
  const db: Db = {
    async query<T>(text: string, params: unknown[] = []) {
      const rows = await sql.unsafe(text, params as never[]);
      return [...rows] as T[];
    },
    async exec(text: string) {
      await sql.unsafe(text);
    },
    transaction<R>(fn: (tx: Db) => Promise<R>): Promise<R> {
      if (inTransaction) return fn(db);
      return (sql as postgres.Sql).begin((tx) => fn(wrap(tx, true))) as unknown as Promise<R>;
    },
  };
  return db;
}

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

/**
 * Decides whether to require TLS for a given DATABASE_URL.
 * Loopback hosts (localhost, 127.0.0.1, ::1) never need TLS. Any other host requires it,
 * unless the URL explicitly opts out with `sslmode=disable`.
 */
export function sslOptionFor(url: string): false | 'require' {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'require';
  }
  if (parsed.searchParams.get('sslmode') === 'disable') return false;
  const hostname = parsed.hostname.replace(/^\[|\]$/g, '');
  if (LOOPBACK_HOSTNAMES.has(hostname)) return false;
  return 'require';
}

function poolMax(): number {
  const raw = process.env.DB_POOL_MAX;
  if (!raw) return 5;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : 5;
}

export function createPostgresDb(url: string): Db {
  const sql = postgres(url, {
    // Supabase's transaction pooler does not support prepared statements.
    prepare: false,
    max: poolMax(),
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: sslOptionFor(url),
  });
  return wrap(sql, false);
}
