import { PGlite } from '@electric-sql/pglite';
import { wrapPglite } from '@/lib/db/pglite';
import { runMigrations } from '@/lib/db/migrate';
import type { Db } from '@/lib/db/types';

export async function createTestDb(): Promise<Db> {
  const db = wrapPglite(new PGlite());
  await runMigrations(db);
  return db;
}

export async function locationIdByName(db: Db, name: string): Promise<string> {
  const rows = await db.query<{ id: string }>('select id from locations where name = $1', [name]);
  if (!rows[0]) throw new Error(`location not found: ${name}`);
  return rows[0].id;
}

/** Inserts a staff row with a dummy PIN hash (use createStaff when a real PIN is needed). */
export async function insertStaff(db: Db, name = 'テスト', role: 'admin' | 'staff' = 'staff'): Promise<string> {
  const rows = await db.query<{ id: string }>(
    `insert into staff (name, pin_hash, role) values ($1, 'x', $2) returning id`,
    [name, role],
  );
  return rows[0].id;
}

export async function insertDrink(db: Db, name = 'コーラ', unitsPerCase = 24): Promise<string> {
  const rows = await db.query<{ id: string }>(
    'insert into drinks (name, units_per_case) values ($1, $2) returning id',
    [name, unitsPerCase],
  );
  return rows[0].id;
}
