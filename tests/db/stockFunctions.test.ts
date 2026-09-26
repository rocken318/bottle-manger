import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/lib/db/types';
import { createTestDb, insertDrink, insertStaff, locationIdByName } from '../helpers/testDb';

type Item = {
  type: 'receive' | 'sale' | 'transfer' | 'adjust';
  drink_id: string;
  from_location_id?: string | null;
  to_location_id?: string | null;
  quantity?: number | null;
  counted_quantity?: number | null;
  note?: string | null;
};

let db: Db;
let staffId: string;
let drinkId: string;
let office: string;
let kingyo: string;

async function apply(batchId: string, items: Item[]) {
  return db.query<{ id: string; quantity: number }>(
    'select id, quantity from apply_movements($1, $2, $3::jsonb)',
    [batchId, staffId, JSON.stringify(items)],
  );
}

async function stock(locationId: string, drink = drinkId): Promise<number> {
  const rows = await db.query<{ quantity: number }>(
    'select quantity from stock_levels where location_id = $1 and drink_id = $2',
    [locationId, drink],
  );
  return rows[0]?.quantity ?? 0;
}

beforeEach(async () => {
  db = await createTestDb();
  staffId = await insertStaff(db);
  drinkId = await insertDrink(db);
  office = await locationIdByName(db, '事務所');
  kingyo = await locationIdByName(db, 'Kingyo');
});

describe('apply_movements', () => {
  it('handles receive, sale and transfer', async () => {
    await apply(crypto.randomUUID(), [{ type: 'receive', drink_id: drinkId, to_location_id: office, quantity: 48 }]);
    await apply(crypto.randomUUID(), [
      { type: 'transfer', drink_id: drinkId, from_location_id: office, to_location_id: kingyo, quantity: 5 },
      { type: 'sale', drink_id: drinkId, from_location_id: kingyo, quantity: 2 },
    ]);
    expect(await stock(office)).toBe(43);
    expect(await stock(kingyo)).toBe(3);
  });

  it('turns a stocktake count into a difference', async () => {
    await apply(crypto.randomUUID(), [{ type: 'receive', drink_id: drinkId, to_location_id: office, quantity: 10 }]);
    const rows = await apply(crypto.randomUUID(), [
      { type: 'adjust', drink_id: drinkId, to_location_id: office, counted_quantity: 7 },
    ]);
    expect(rows[0].quantity).toBe(-3);
    expect(await stock(office)).toBe(7);
  });

  it('is idempotent per batch id', async () => {
    const batchId = crypto.randomUUID();
    const item: Item = { type: 'receive', drink_id: drinkId, to_location_id: office, quantity: 10 };
    const first = await apply(batchId, [item]);
    const second = await apply(batchId, [item]);
    expect(second.map((r) => r.id)).toEqual(first.map((r) => r.id));
    expect(await stock(office)).toBe(10);
  });

  it('rolls back the whole batch when a drink is inactive', async () => {
    const retired = await insertDrink(db, '廃止ドリンク', 12);
    await db.query('update drinks set is_active = false where id = $1', [retired]);
    await expect(
      apply(crypto.randomUUID(), [
        { type: 'receive', drink_id: drinkId, to_location_id: office, quantity: 10 },
        { type: 'receive', drink_id: retired, to_location_id: office, quantity: 10 },
      ]),
    ).rejects.toThrow('inactive_drink');
    expect(await stock(office)).toBe(0);
  });

  it('rejects an inactive location', async () => {
    await db.query('update locations set is_active = false where id = $1', [kingyo]);
    await expect(
      apply(crypto.randomUUID(), [
        { type: 'transfer', drink_id: drinkId, from_location_id: office, to_location_id: kingyo, quantity: 1 },
      ]),
    ).rejects.toThrow('inactive_location');
  });

  it('stores the note and the staff member', async () => {
    const [row] = await apply(crypto.randomUUID(), [
      { type: 'receive', drink_id: drinkId, to_location_id: office, quantity: 1, note: '酒屋A' },
    ]);
    const [saved] = await db.query<{ note: string; staff_id: string }>(
      'select note, staff_id from stock_movements where id = $1',
      [row.id],
    );
    expect(saved).toEqual({ note: '酒屋A', staff_id: staffId });
  });
});

describe('void_movement', () => {
  it('removes the movement from stock and writes an audit log', async () => {
    const [row] = await apply(crypto.randomUUID(), [
      { type: 'receive', drink_id: drinkId, to_location_id: office, quantity: 10 },
    ]);
    await db.query('select void_movement($1, $2)', [row.id, staffId]);
    expect(await stock(office)).toBe(0);
    const logs = await db.query<{ action: string; target_id: string }>('select action, target_id from audit_logs');
    expect(logs).toEqual([{ action: 'movement.void', target_id: row.id }]);
  });

  it('refuses to void twice', async () => {
    const [row] = await apply(crypto.randomUUID(), [
      { type: 'receive', drink_id: drinkId, to_location_id: office, quantity: 10 },
    ]);
    await db.query('select void_movement($1, $2)', [row.id, staffId]);
    await expect(db.query('select void_movement($1, $2)', [row.id, staffId])).rejects.toThrow('already_voided');
  });

  it('reports a missing movement', async () => {
    await expect(db.query('select void_movement($1, $2)', [crypto.randomUUID(), staffId])).rejects.toThrow(
      'movement_not_found',
    );
  });
});
