import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/lib/db/types';
import {
  getMonthLines,
  listPurchaseDetails,
  listVarianceDetails,
  loadMonthlyReport,
} from '@/lib/repo/costs';
import { voidMovement } from '@/lib/repo/movements';
import { savePrice } from '@/lib/repo/prices';
import { applyMovements } from '@/lib/repo/stock';
import type { MovementInput } from '@/lib/types';
import { createTestDb, insertDrink, insertStaff, locationIdByName } from '../helpers/testDb';

let db: Db;
let staffId: string;
let cola: string;
let office: string;
let kingyo: string;

/** Applies one movement, then back-dates it to `at` (an ISO timestamp). Must be called in time order. */
async function move(item: Partial<MovementInput> & Pick<MovementInput, 'type' | 'drinkId'>, at: string): Promise<string> {
  const [id] = await applyMovements(db, crypto.randomUUID(), staffId, [
    { fromLocationId: null, toLocationId: null, quantity: 0, countedQuantity: null, note: null, ...item },
  ]);
  await db.query('update stock_movements set created_at = $2 where id = $1', [id, at]);
  return id;
}

beforeEach(async () => {
  db = await createTestDb();
  staffId = await insertStaff(db, '花子', 'admin');
  cola = await insertDrink(db, 'コーラ', 24);
  office = await locationIdByName(db, '事務所');
  kingyo = await locationIdByName(db, 'Kingyo');

  await savePrice(db, staffId, { drinkId: cola, effectiveFrom: '2026-03-01', mode: 'unit', amountCents: 10000 });
  await savePrice(db, staffId, { drinkId: cola, effectiveFrom: '2026-04-15', mode: 'unit', amountCents: 12000 });

  // March: receive 48 at 事務所.
  await move({ type: 'receive', drinkId: cola, toLocationId: office, quantity: 48 }, '2026-03-10T01:00:00Z');
  // 2026-03-31T15:30Z is 2026-04-01 00:30 JST, so this receive belongs to April.
  await move({ type: 'receive', drinkId: cola, toLocationId: office, quantity: 24, note: '月初の入荷' }, '2026-03-31T15:30:00Z');
  await move({ type: 'transfer', drinkId: cola, fromLocationId: office, toLocationId: kingyo, quantity: 10 }, '2026-04-05T03:00:00Z');
  await move({ type: 'sale', drinkId: cola, fromLocationId: office, quantity: 20 }, '2026-04-10T03:00:00Z');
  // Book: 48 + 24 - 10 - 20 = 42; counted 40 -> -2 on 04-20 (price 120).
  await move({ type: 'adjust', drinkId: cola, toLocationId: office, countedQuantity: 40 }, '2026-04-20T03:00:00Z');
  // A voided receive must not count anywhere.
  const voided = await move({ type: 'receive', drinkId: cola, toLocationId: office, quantity: 5 }, '2026-04-21T03:00:00Z');
  await voidMovement(db, voided, staffId);
  // 2026-04-30T15:00Z is 2026-05-01 00:00 JST -> May.
  await move({ type: 'sale', drinkId: cola, fromLocationId: office, quantity: 1 }, '2026-04-30T15:00:00Z');
});

describe('month lines', () => {
  it('computes per (location, month, drink) quantities and prices in JST', async () => {
    const lines = await getMonthLines(db, { fromMonth: '2026-03', toMonth: '2026-05' });
    const find = (loc: string, month: string) => lines.find((l) => l.locationId === loc && l.month === month && l.drinkId === cola);

    expect(find(office, '2026-03')).toEqual({
      locationId: office,
      month: '2026-03',
      drinkId: cola,
      openingQty: 0,
      openingUnitCents: 10000,
      closingQty: 48,
      closingUnitCents: 10000,
      flows: { receive: { qty: 48, amountCents: 480000, missing: false } },
    });
    expect(find(office, '2026-04')).toEqual({
      locationId: office,
      month: '2026-04',
      drinkId: cola,
      openingQty: 48,
      openingUnitCents: 10000,
      closingQty: 40,
      closingUnitCents: 12000,
      flows: {
        receive: { qty: 24, amountCents: 240000, missing: false },
        transfer_out: { qty: 10, amountCents: 100000, missing: false },
        adjust: { qty: -2, amountCents: -24000, missing: false },
      },
    });
    expect(find(kingyo, '2026-04')).toMatchObject({
      openingQty: 0,
      closingQty: 10,
      closingUnitCents: 12000,
      flows: { transfer_in: { qty: 10, amountCents: 100000, missing: false } },
    });
    expect(find(office, '2026-05')).toMatchObject({ openingQty: 40, closingQty: 39, flows: {} });
    expect(find(kingyo, '2026-03')).toBeUndefined();
  });

  it('filters by location', async () => {
    const lines = await getMonthLines(db, { fromMonth: '2026-04', toMonth: '2026-04', locationId: kingyo });
    expect(lines.map((l) => l.locationId)).toEqual([kingyo]);
  });
});

describe('monthly report', () => {
  it('values stock with the price effective on each date and derives COGS', async () => {
    const report = await loadMonthlyReport(db, { fromMonth: '2026-04', toMonth: '2026-04' }, 10);
    const officeRow = report.rows.find((r) => r.locationId === office);
    expect(officeRow).toMatchObject({
      month: '2026-04',
      locationName: '事務所',
      openingYen: 4800,
      purchaseYen: 2400,
      purchaseTaxYen: 240,
      purchaseInclYen: 2640,
      transferInYen: 0,
      transferOutYen: 1000,
      varianceYen: -240,
      closingYen: 4800,
      cogsYen: 1400,
      missingCount: 0,
    });
    expect(officeRow?.lossRate).toBeCloseTo(240 / 1400);

    const kingyoRow = report.rows.find((r) => r.locationId === kingyo);
    expect(kingyoRow).toMatchObject({ transferInYen: 1000, closingYen: 1200, cogsYen: -200, lossRate: null });

    // Active locations without any movement still get a (zero) row; the total comes last.
    expect(report.rows.map((r) => r.locationName)).toEqual(['事務所', 'Kingyo', 'B-club', '暖家', 'En', '全店合計']);
    const total = report.rows.at(-1);
    expect(total).toMatchObject({
      locationId: null,
      openingYen: 4800,
      purchaseYen: 2400,
      transferInYen: 1000,
      transferOutYen: 1000,
      varianceYen: -240,
      closingYen: 6000,
      cogsYen: 1200,
    });
    expect(report.missingDrinks).toEqual([]);
  });

  it('shows only the chosen location and no total when filtered', async () => {
    const report = await loadMonthlyReport(db, { fromMonth: '2026-03', toMonth: '2026-04', locationId: office }, 10);
    expect(report.rows.map((r) => [r.month, r.locationName])).toEqual([
      ['2026-03', '事務所'],
      ['2026-04', '事務所'],
    ]);
    expect(report.rows[0]).toMatchObject({ openingYen: 0, purchaseYen: 4800, closingYen: 4800, cogsYen: 0, lossRate: null });
  });

  it('counts drinks without a price and leaves them out of the amounts', async () => {
    const tea = await insertDrink(db, 'お茶', 24);
    await move({ type: 'receive', drinkId: tea, toLocationId: office, quantity: 12 }, '2026-04-25T03:00:00Z');
    const report = await loadMonthlyReport(db, { fromMonth: '2026-04', toMonth: '2026-04' }, 10);
    const officeRow = report.rows.find((r) => r.locationId === office);
    expect(officeRow).toMatchObject({ purchaseYen: 2400, closingYen: 4800, missingCount: 1, missingDrinkIds: [tea] });
    expect(report.rows.at(-1)).toMatchObject({ missingCount: 1 });
    expect(report.missingDrinks).toEqual([{ id: tea, name: 'お茶' }]);
  });
});

describe('detail lists', () => {
  it('lists receives with the price on the JST receive date', async () => {
    const rows = await listPurchaseDetails(db, { fromMonth: '2026-04', toMonth: '2026-04' });
    expect(rows).toEqual([
      expect.objectContaining({
        date: '2026-04-01',
        locationId: office,
        locationName: '事務所',
        drinkName: 'コーラ',
        quantity: 24,
        unitCents: 10000,
        staffName: '花子',
        note: '月初の入荷',
      }),
    ]);
    expect(await listPurchaseDetails(db, { fromMonth: '2026-04', toMonth: '2026-04', locationId: kingyo })).toEqual([]);
    expect((await listPurchaseDetails(db, { fromMonth: '2026-03', toMonth: '2026-03' })).map((r) => r.quantity)).toEqual([48]);
  });

  it('lists stocktakes with book, counted and difference', async () => {
    const rows = await listVarianceDetails(db, { fromMonth: '2026-04', toMonth: '2026-04' });
    expect(rows).toEqual([
      expect.objectContaining({
        locationId: office,
        locationName: '事務所',
        staffName: '花子',
        drinkId: cola,
        drinkName: 'コーラ',
        bookQty: 42,
        countedQty: 40,
        diffQty: -2,
        unitCents: 12000,
      }),
    ]);
    expect(await listVarianceDetails(db, { fromMonth: '2026-03', toMonth: '2026-03' })).toEqual([]);
  });

  it('reports a missing price as null', async () => {
    const tea = await insertDrink(db, 'お茶', 24);
    await move({ type: 'adjust', drinkId: tea, toLocationId: kingyo, countedQuantity: 3 }, '2026-04-25T03:00:00Z');
    const rows = await listVarianceDetails(db, { fromMonth: '2026-04', toMonth: '2026-04', locationId: kingyo });
    expect(rows).toEqual([expect.objectContaining({ drinkId: tea, bookQty: 0, countedQty: 3, diffQty: 3, unitCents: null })]);
  });
});
