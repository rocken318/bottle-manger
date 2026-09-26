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

export function createPostgresDb(url: string): Db {
  const sql = postgres(url, {
    // Supabase's transaction pooler does not support prepared statements.
    prepare: false,
    max: Number(process.env.DB_POOL_MAX ?? 5),
    idle_timeout: 20,
  });
  return wrap(sql, false);
}
