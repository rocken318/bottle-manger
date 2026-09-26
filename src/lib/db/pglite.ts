import type { PGlite, Transaction } from '@electric-sql/pglite';
import type { Db } from './types';

function wrapTransaction(tx: Transaction): Db {
  const db: Db = {
    async query<T>(text: string, params: unknown[] = []) {
      return (await tx.query<T>(text, params as never[])).rows;
    },
    async exec(text: string) {
      await tx.exec(text);
    },
    transaction: (fn) => fn(db),
  };
  return db;
}

export function wrapPglite(pg: PGlite): Db {
  return {
    async query<T>(text: string, params: unknown[] = []) {
      return (await pg.query<T>(text, params as never[])).rows;
    },
    async exec(text: string) {
      await pg.exec(text);
    },
    transaction: (fn) => pg.transaction((tx) => fn(wrapTransaction(tx))),
  };
}
