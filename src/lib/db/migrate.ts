import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Db } from './types';

export const MIGRATIONS_DIR = path.join(process.cwd(), 'db', 'migrations');

/** Applies every not-yet-applied .sql file in name order. Returns the applied file names. */
export async function runMigrations(db: Db, dir: string = MIGRATIONS_DIR): Promise<string[]> {
  await db.exec(
    'create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())',
  );
  const applied = new Set(
    (await db.query<{ name: string }>('select name from schema_migrations')).map((r) => r.name),
  );
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const ran: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sqlText = await readFile(path.join(dir, file), 'utf8');
    await db.transaction(async (tx) => {
      await tx.exec(sqlText);
      await tx.query('insert into schema_migrations (name) values ($1)', [file]);
    });
    ran.push(file);
  }
  return ran;
}
