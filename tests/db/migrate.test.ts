import { describe, expect, it } from 'vitest';
import { runMigrations } from '@/lib/db/migrate';
import { createTestDb, insertDrink, insertStaff, locationIdByName } from '../helpers/testDb';

describe('migrations', () => {
  it('seeds the five initial locations in order', async () => {
    const db = await createTestDb();
    const rows = await db.query<{ name: string }>('select name from locations order by sort_order');
    expect(rows.map((r) => r.name)).toEqual(['事務所', 'Kingyo', 'B-club', '暖家', 'En']);
  });

  it('is idempotent', async () => {
    const db = await createTestDb();
    expect(await runMigrations(db)).toEqual([]);
  });

  it('rejects a sale without a source location', async () => {
    const db = await createTestDb();
    const staffId = await insertStaff(db);
    const drinkId = await insertDrink(db);
    const to = await locationIdByName(db, '事務所');
    await expect(
      db.query(
        `insert into stock_movements (batch_id, type, drink_id, to_location_id, quantity, staff_id)
         values (gen_random_uuid(), 'sale', $1, $2, 1, $3)`,
        [drinkId, to, staffId],
      ),
    ).rejects.toThrow(/movement_shape/);
  });

  it('computes stock_levels from non-voided movements', async () => {
    const db = await createTestDb();
    const staffId = await insertStaff(db);
    const drinkId = await insertDrink(db);
    const office = await locationIdByName(db, '事務所');
    await db.query(
      `insert into stock_movements (batch_id, type, drink_id, to_location_id, quantity, staff_id)
       values (gen_random_uuid(), 'receive', $1, $2, 10, $3)`,
      [drinkId, office, staffId],
    );
    await db.query(
      `insert into stock_movements (batch_id, type, drink_id, from_location_id, quantity, staff_id, voided_at, voided_by)
       values (gen_random_uuid(), 'sale', $1, $2, 4, $3, now(), $3)`,
      [drinkId, office, staffId],
    );
    const rows = await db.query<{ quantity: number }>(
      'select quantity from stock_levels where location_id = $1 and drink_id = $2',
      [office, drinkId],
    );
    expect(rows[0].quantity).toBe(10);
  });
});
