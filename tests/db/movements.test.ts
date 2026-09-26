import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/lib/db/types';
import { getMovementForVoid, listMovements, voidMovement } from '@/lib/repo/movements';
import { applyMovements } from '@/lib/repo/stock';
import { createTestDb, insertDrink, insertStaff, locationIdByName } from '../helpers/testDb';

let db: Db;
let staffId: string;
let drinkId: string;
let office: string;
let kingyo: string;

beforeEach(async () => {
  db = await createTestDb();
  staffId = await insertStaff(db, '花子');
  drinkId = await insertDrink(db);
  office = await locationIdByName(db, '事務所');
  kingyo = await locationIdByName(db, 'Kingyo');
  await applyMovements(db, crypto.randomUUID(), staffId, [
    { type: 'receive', drinkId, fromLocationId: null, toLocationId: office, quantity: 48, countedQuantity: null, note: null },
  ]);
  await applyMovements(db, crypto.randomUUID(), staffId, [
    { type: 'transfer', drinkId, fromLocationId: office, toLocationId: kingyo, quantity: 5, countedQuantity: null, note: null },
  ]);
});

describe('movements repository', () => {
  it('lists movements newest first with names', async () => {
    const rows = await listMovements(db, {}, 100);
    expect(rows.map((r) => r.type)).toEqual(['transfer', 'receive']);
    expect(rows[0]).toMatchObject({
      drinkName: 'コーラ',
      unitsPerCase: 24,
      fromLocationName: '事務所',
      toLocationName: 'Kingyo',
      staffName: '花子',
      voidedAt: null,
    });
  });

  it('filters by location on either side and by type', async () => {
    expect((await listMovements(db, { locationId: kingyo }, 100)).map((r) => r.type)).toEqual(['transfer']);
    expect((await listMovements(db, { type: 'receive' }, 100)).map((r) => r.type)).toEqual(['receive']);
  });

  it('filters by JST date range', async () => {
    expect(await listMovements(db, { toDate: '2000-01-01' }, 100)).toEqual([]);
  });

  it('clamps out-of-range limits instead of erroring', async () => {
    expect((await listMovements(db, {}, 0)).length).toBeGreaterThan(0);
    expect((await listMovements(db, {}, -5)).length).toBeGreaterThan(0);
    await expect(listMovements(db, {}, 999999)).resolves.not.toThrow();
  });

  it('voids a movement and shows who voided it', async () => {
    const [latest] = await listMovements(db, {}, 1);
    const target = await getMovementForVoid(db, latest.id);
    expect(target).toMatchObject({ id: latest.id, staffId, voidedAt: null });
    await voidMovement(db, latest.id, staffId);
    const [after] = await listMovements(db, {}, 1);
    expect(after.voidedByName).toBe('花子');
  });
});
