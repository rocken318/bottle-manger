import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/lib/db/types';
import { applyMovements, batchExists, getStockLevels } from '@/lib/repo/stock';
import { createTestDb, insertDrink, insertStaff, locationIdByName } from '../helpers/testDb';

let db: Db;

beforeEach(async () => {
  db = await createTestDb();
});

describe('stock repository', () => {
  it('applies movements and reads levels', async () => {
    const staffId = await insertStaff(db);
    const drinkId = await insertDrink(db);
    const office = await locationIdByName(db, '事務所');
    const batchId = crypto.randomUUID();
    expect(await batchExists(db, batchId)).toBe(false);
    const ids = await applyMovements(db, batchId, staffId, [
      {
        type: 'receive',
        drinkId,
        fromLocationId: null,
        toLocationId: office,
        quantity: 48,
        countedQuantity: null,
        note: null,
      },
    ]);
    expect(ids).toHaveLength(1);
    expect(await batchExists(db, batchId)).toBe(true);
    expect(await getStockLevels(db)).toEqual([{ locationId: office, drinkId, quantity: 48 }]);
  });
});
