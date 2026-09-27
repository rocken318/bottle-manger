import type { Db } from '../src/lib/db/types';

/** Shared by the developer scripts: the active staff member with this name, or exit with an error. */
export async function activeStaffIdByName(db: Db, name: string): Promise<string> {
  const rows = await db.query<{ id: string }>('select id from staff where name = $1 and is_active', [name]);
  if (!rows[0]) {
    console.error(`有効なスタッフが見つかりません: ${name}`);
    process.exit(1);
  }
  return rows[0].id;
}

export function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set (.env.local を確認してください)');
    process.exit(1);
  }
  return url;
}
