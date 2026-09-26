import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/lib/db/types';
import { createDrink, listDrinks, setDrinkActive } from '@/lib/repo/drinks';
import { listAuditLogs } from '@/lib/repo/audit';
import { applyMovements } from '@/lib/repo/stock';
import { createTestDb, insertStaff, locationIdByName } from '../helpers/testDb';

let db: Db;
let staffId: string;

beforeEach(async () => {
  db = await createTestDb();
  staffId = await insertStaff(db);
});

describe('drinks repository', () => {
  it('creates a drink and logs it', async () => {
    const d = await createDrink(db, staffId, { name: 'コーラ', unitsPerCase: 24 });
    expect(d).toMatchObject({ name: 'コーラ', unitsPerCase: 24, isActive: true });
    expect((await listAuditLogs(db, 1))[0]).toMatchObject({ action: 'drink.create', targetId: d.id });
  });

  it('hides retired drinks unless asked', async () => {
    const d = await createDrink(db, staffId, { name: 'コーラ', unitsPerCase: 24 });
    await createDrink(db, staffId, { name: 'ビール', unitsPerCase: 24 });
    await setDrinkActive(db, staffId, d.id, false);
    expect((await listDrinks(db)).map((x) => x.name)).toEqual(['ビール']);
    expect((await listDrinks(db, { includeInactive: true })).length).toBe(2);
    expect((await listAuditLogs(db, 1))[0].action).toBe('drink.deactivate');
  });

  it('rejects duplicate names', async () => {
    await createDrink(db, staffId, { name: 'コーラ', unitsPerCase: 24 });
    await expect(createDrink(db, staffId, { name: 'コーラ', unitsPerCase: 12 })).rejects.toMatchObject({
      code: '23505',
    });
  });

  it('does not write a duplicate audit row when already in the requested state', async () => {
    const d = await createDrink(db, staffId, { name: 'コーラ', unitsPerCase: 24 });
    await setDrinkActive(db, staffId, d.id, false);
    const countAfterFirst = (await listAuditLogs(db, 100)).filter((l) => l.action === 'drink.deactivate').length;
    expect(countAfterFirst).toBe(1);

    await setDrinkActive(db, staffId, d.id, false);
    const countAfterSecond = (await listAuditLogs(db, 100)).filter((l) => l.action === 'drink.deactivate').length;
    expect(countAfterSecond).toBe(1);
  });

  it('throws drink_not_found for a missing drink', async () => {
    await expect(setDrinkActive(db, staffId, crypto.randomUUID(), false)).rejects.toThrow('drink_not_found');
  });

  it('refuses to retire a drink that still has stock at any location', async () => {
    const d = await createDrink(db, staffId, { name: 'コーラ', unitsPerCase: 24 });
    const locationId = await locationIdByName(db, '事務所');
    await applyMovements(db, crypto.randomUUID(), staffId, [
      {
        type: 'receive',
        drinkId: d.id,
        fromLocationId: null,
        toLocationId: locationId,
        quantity: 3,
        countedQuantity: null,
        note: null,
      },
    ]);
    await expect(setDrinkActive(db, staffId, d.id, false)).rejects.toThrow('drink_has_stock');
  });

  it('allows retiring a drink once all locations are zeroed out', async () => {
    const d = await createDrink(db, staffId, { name: 'コーラ', unitsPerCase: 24 });
    const locationId = await locationIdByName(db, '事務所');
    await applyMovements(db, crypto.randomUUID(), staffId, [
      {
        type: 'receive',
        drinkId: d.id,
        fromLocationId: null,
        toLocationId: locationId,
        quantity: 3,
        countedQuantity: null,
        note: null,
      },
    ]);
    await applyMovements(db, crypto.randomUUID(), staffId, [
      {
        type: 'adjust',
        drinkId: d.id,
        fromLocationId: null,
        toLocationId: locationId,
        quantity: 0,
        countedQuantity: 0,
        note: null,
      },
    ]);
    await expect(setDrinkActive(db, staffId, d.id, false)).resolves.toBeUndefined();
    expect((await listDrinks(db)).map((x) => x.name)).not.toContain('コーラ');
  });
});
