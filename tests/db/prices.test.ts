import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/lib/db/types';
import { listAuditLogs } from '@/lib/repo/audit';
import { deletePrice, getPriceOn, listCurrentPrices, listPriceHistory, savePrice } from '@/lib/repo/prices';
import { createTestDb, insertDrink, insertStaff } from '../helpers/testDb';

let db: Db;
let adminId: string;
let cola: string;

beforeEach(async () => {
  db = await createTestDb();
  adminId = await insertStaff(db, '管理者', 'admin');
  cola = await insertDrink(db, 'コーラ', 24);
});

describe('drink prices', () => {
  it('looks up the price effective on a date (latest effective_from <= date)', async () => {
    expect(await getPriceOn(db, cola, '2026-04-01')).toBeNull();
    await savePrice(db, adminId, { drinkId: cola, effectiveFrom: '2026-03-01', mode: 'unit', amountCents: 10000 });
    await savePrice(db, adminId, { drinkId: cola, effectiveFrom: '2026-04-15', mode: 'unit', amountCents: 12000 });
    expect(await getPriceOn(db, cola, '2026-02-28')).toBeNull();
    expect(await getPriceOn(db, cola, '2026-03-01')).toBe(10000);
    expect(await getPriceOn(db, cola, '2026-04-14')).toBe(10000);
    expect(await getPriceOn(db, cola, '2026-04-15')).toBe(12000);
    expect(await getPriceOn(db, cola, '2030-01-01')).toBe(12000);

    const current = await listCurrentPrices(db, '2026-04-10');
    expect(current.get(cola)).toEqual({ unitCents: 10000, effectiveFrom: '2026-03-01' });
  });

  it('converts a case price to a per-bottle price rounded to 2 decimals', async () => {
    const r = await savePrice(db, adminId, { drinkId: cola, effectiveFrom: '2026-04-01', mode: 'case', amountCents: 200000 });
    expect(r).toMatchObject({ action: 'create', unitCents: 8333 });
    expect(await getPriceOn(db, cola, '2026-04-01')).toBe(8333);
  });

  it('overwrites a price with the same effective date and audits create/update/delete', async () => {
    const first = await savePrice(db, adminId, { drinkId: cola, effectiveFrom: '2026-04-01', mode: 'unit', amountCents: 10000 });
    expect(first.action).toBe('create');
    const second = await savePrice(db, adminId, { drinkId: cola, effectiveFrom: '2026-04-01', mode: 'unit', amountCents: 11000 });
    expect(second).toMatchObject({ action: 'update', id: first.id, unitCents: 11000 });
    const same = await savePrice(db, adminId, { drinkId: cola, effectiveFrom: '2026-04-01', mode: 'unit', amountCents: 11000 });
    expect(same.action).toBe('none');

    const history = await listPriceHistory(db);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      drinkId: cola,
      drinkName: 'コーラ',
      unitCents: 11000,
      effectiveFrom: '2026-04-01',
      createdByName: '管理者',
    });

    await deletePrice(db, adminId, first.id);
    expect(await listPriceHistory(db)).toEqual([]);
    await expect(deletePrice(db, adminId, first.id)).rejects.toThrow('price_not_found');

    const logs = await listAuditLogs(db, 10);
    expect(logs.map((l) => l.action)).toEqual(['price.delete', 'price.update', 'price.create']);
    expect(logs[1].details).toMatchObject({
      name: 'コーラ',
      effectiveFrom: '2026-04-01',
      unitCost: '110.00',
      before: { unitCost: '100.00' },
    });
    expect(logs[0].details).toMatchObject({ name: 'コーラ', effectiveFrom: '2026-04-01', unitCost: '110.00' });
  });

  it('rejects an unknown drink', async () => {
    await expect(
      savePrice(db, adminId, {
        drinkId: crypto.randomUUID(),
        effectiveFrom: '2026-04-01',
        mode: 'unit',
        amountCents: 100,
      }),
    ).rejects.toThrow('drink_not_found');
  });
});
