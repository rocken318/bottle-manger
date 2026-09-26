import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/lib/db/types';
import { createLocation, listLocations, updateLocation } from '@/lib/repo/locations';
import { applyMovements } from '@/lib/repo/stock';
import { createTestDb, insertDrink, insertStaff } from '../helpers/testDb';

let db: Db;
let staffId: string;

beforeEach(async () => {
  db = await createTestDb();
  staffId = await insertStaff(db, '管理者', 'admin');
});

describe('locations repository', () => {
  it('lists active locations in display order', async () => {
    expect((await listLocations(db)).map((l) => l.name)).toEqual(['事務所', 'Kingyo', 'B-club', '暖家', 'En']);
  });

  it('adds, renames and deactivates a location', async () => {
    const l = await createLocation(db, staffId, { name: '新店', sortOrder: 6 });
    await updateLocation(db, staffId, { id: l.id, name: '新店舗', sortOrder: 0, isActive: true });
    expect((await listLocations(db))[0].name).toBe('新店舗');
    await updateLocation(db, staffId, { id: l.id, name: '新店舗', sortOrder: 0, isActive: false });
    expect((await listLocations(db)).map((x) => x.name)).not.toContain('新店舗');
    expect((await listLocations(db, { includeInactive: true })).map((x) => x.name)).toContain('新店舗');
  });

  it('refuses to deactivate a location that still has stock', async () => {
    const l = await createLocation(db, staffId, { name: '新店', sortOrder: 6 });
    const drinkId = await insertDrink(db);
    await applyMovements(db, crypto.randomUUID(), staffId, [
      {
        type: 'receive',
        drinkId,
        fromLocationId: null,
        toLocationId: l.id,
        quantity: 5,
        countedQuantity: null,
        note: null,
      },
    ]);
    await expect(
      updateLocation(db, staffId, { id: l.id, name: l.name, sortOrder: l.sortOrder, isActive: false }),
    ).rejects.toThrow('location_has_stock');
  });

  it('allows deactivating a location once stock is zeroed out', async () => {
    const l = await createLocation(db, staffId, { name: '新店', sortOrder: 6 });
    const drinkId = await insertDrink(db);
    const batchId = crypto.randomUUID();
    await applyMovements(db, batchId, staffId, [
      {
        type: 'receive',
        drinkId,
        fromLocationId: null,
        toLocationId: l.id,
        quantity: 5,
        countedQuantity: null,
        note: null,
      },
    ]);
    await applyMovements(db, crypto.randomUUID(), staffId, [
      {
        type: 'adjust',
        drinkId,
        fromLocationId: null,
        toLocationId: l.id,
        quantity: 0,
        countedQuantity: 0,
        note: null,
      },
    ]);
    await expect(
      updateLocation(db, staffId, { id: l.id, name: l.name, sortOrder: l.sortOrder, isActive: false }),
    ).resolves.toBeUndefined();
    expect((await listLocations(db)).map((x) => x.name)).not.toContain('新店');
  });
});
