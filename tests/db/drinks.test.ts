import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/lib/db/types';
import { createDrink, listDrinks, setDrinkActive } from '@/lib/repo/drinks';
import { listAuditLogs } from '@/lib/repo/audit';
import { createTestDb, insertStaff } from '../helpers/testDb';

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
});
