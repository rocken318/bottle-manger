import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import { wrapPglite } from '@/lib/db/pglite';
import { runMigrations } from '@/lib/db/migrate';
import { createTestDb } from '../helpers/testDb';

describe('lockdown', () => {
  it('enables row level security on every table', async () => {
    const db = await createTestDb();
    const rows = await db.query<{ relname: string }>(
      `select relname from pg_class
       where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity`,
    );
    expect(rows).toEqual([]);
  });

  it(
    'locks anon/authenticated out of every table (incl. drink_prices/app_settings), the stock_levels view, and both RPC functions',
    async () => {
      const db = wrapPglite(new PGlite());
      await db.exec(`
        create role anon;
        create role authenticated;
        alter default privileges in schema public grant all on tables to anon, authenticated;
        alter default privileges in schema public grant all on functions to anon, authenticated;
        alter default privileges in schema public grant all on sequences to anon, authenticated;
      `);
      await runMigrations(db);

      const tables = await db.query<{ table_name: string }>(
        `select table_name from information_schema.tables where table_schema = 'public'`,
      );
      expect(tables.map((t) => t.table_name)).toEqual(expect.arrayContaining(['stock_movements', 'stock_levels', 'drink_prices', 'app_settings']));

      for (const { table_name } of tables) {
        const [{ anon_ok, authenticated_ok }] = await db.query<{ anon_ok: boolean; authenticated_ok: boolean }>(
          `select has_table_privilege('anon', $1, 'select') as anon_ok,
                  has_table_privilege('authenticated', $1, 'select') as authenticated_ok`,
          [table_name],
        );
        expect([table_name, anon_ok, authenticated_ok]).toEqual([table_name, false, false]);
      }

      for (const fn of ['apply_movements(uuid,uuid,jsonb)', 'void_movement(uuid,uuid)']) {
        const [{ anon_ok, authenticated_ok }] = await db.query<{ anon_ok: boolean; authenticated_ok: boolean }>(
          `select has_function_privilege('anon', $1, 'execute') as anon_ok,
                  has_function_privilege('authenticated', $1, 'execute') as authenticated_ok`,
          [fn],
        );
        expect([fn, anon_ok, authenticated_ok]).toEqual([fn, false, false]);
      }
    },
    60_000,
  );
});
