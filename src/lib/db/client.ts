import { createPostgresDb } from './postgres';
import type { Db } from './types';

const globalForDb = globalThis as unknown as { __drinkInventoryDb?: Db };

export function getDb(): Db {
  if (!globalForDb.__drinkInventoryDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    globalForDb.__drinkInventoryDb = createPostgresDb(url);
  }
  return globalForDb.__drinkInventoryDb;
}
