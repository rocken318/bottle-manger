import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { inject } from 'vitest';
import { wrapPglite } from '@/lib/db/pglite';
import type { Db } from '@/lib/db/types';

let snapshot: Promise<Blob> | undefined;

/** Boots a fresh PGlite from the already-migrated data dir built in tests/globalSetup.ts. */
export async function createTestDb(): Promise<Db> {
  snapshot ??= readFile(inject('pgliteSnapshot')).then((b) => new Blob([b]));
  const pg = new PGlite({ loadDataDir: await snapshot });
  return wrapPglite(pg);
}

export async function locationIdByName(db: Db, name: string): Promise<string> {
  const rows = await db.query<{ id: string }>('select id from locations where name = $1', [name]);
  if (!rows[0]) throw new Error(`location not found: ${name}`);
  return rows[0].id;
}

/** Inserts a staff row with a dummy PIN hash (use createStaff when a real PIN is needed). */
export async function insertStaff(db: Db, name = 'テスト', role: 'master' | 'admin' | 'staff' = 'staff'): Promise<string> {
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
