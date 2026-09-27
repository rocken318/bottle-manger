import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/lib/db/types';
import { getMonthLines, listDisposeDetails, loadMonthlyReport } from '@/lib/repo/costs';
import { listMovements } from '@/lib/repo/movements';
import { addBatchPhotos, getPhoto } from '@/lib/repo/photos';
import { savePrice } from '@/lib/repo/prices';
import { applyMovements, getStockLevels } from '@/lib/repo/stock';
import type { MovementInput } from '@/lib/types';
import { createTestDb, insertDrink, insertStaff, locationIdByName } from '../helpers/testDb';

let db: Db;
let staffId: string;
let cola: string;
let office: string;

const base = { fromLocationId: null, toLocationId: null, quantity: 0, countedQuantity: null, note: null };
const apply = (batchId: string, item: Partial<MovementInput> & Pick<MovementInput, 'type' | 'drinkId'>) =>
  applyMovements(db, batchId, staffId, [{ ...base, ...item }]);

beforeEach(async () => {
  db = await createTestDb();
  staffId = await insertStaff(db, '花子', 'staff');
  cola = await insertDrink(db, 'コーラ', 24);
  office = await locationIdByName(db, '事務所');
  await savePrice(db, staffId, { drinkId: cola, effectiveFrom: '2026-01-01', mode: 'unit', amountCents: 10000 });
  await apply(crypto.randomUUID(), { type: 'receive', drinkId: cola, toLocationId: office, quantity: 10 });
});

describe('破損・廃棄', () => {
  it('takes bottles out of the location and keeps the reason and note', async () => {
    await apply(crypto.randomUUID(), {
      type: 'dispose',
      drinkId: cola,
      fromLocationId: office,
      quantity: 2,
      reason: 'breakage',
      note: '棚から落とした',
    });
    const level = (await getStockLevels(db)).find((l) => l.locationId === office && l.drinkId === cola);
    expect(level?.quantity).toBe(8);
    const [latest] = await listMovements(db, { type: 'dispose' }, 10);
    expect(latest).toMatchObject({ type: 'dispose', quantity: 2, reason: 'breakage', note: '棚から落とした', photoIds: [] });
  });

  it('is rejected by the database without a reason', async () => {
    await expect(
      apply(crypto.randomUUID(), { type: 'dispose', drinkId: cola, fromLocationId: office, quantity: 1 }),
    ).rejects.toThrow();
  });

  it('shows up as 廃棄額 in the cost report, not as a stocktake difference', async () => {
    await apply(crypto.randomUUID(), { type: 'dispose', drinkId: cola, fromLocationId: office, quantity: 3, reason: 'expired' });
    const month = (await db.query<{ m: string }>(`select to_char(now() at time zone 'Asia/Tokyo', 'YYYY-MM') as m`))[0].m;
    const filter = { fromMonth: month, toMonth: month, locationId: office };
    const [line] = await getMonthLines(db, filter);
    expect(line.flows.dispose).toEqual({ qty: 3, amountCents: 30000, missing: false });
    const report = await loadMonthlyReport(db, filter, 10);
    expect(report.rows[0]).toMatchObject({ disposeYen: 300, varianceYen: 0, closingYen: 700, cogsYen: 300, lossRate: 0 });
    const [detail] = await listDisposeDetails(db, filter);
    expect(detail).toMatchObject({ drinkName: 'コーラ', quantity: 3, reason: 'expired', unitCents: 10000, photoIds: [] });
  });
});

describe('photos', () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  let batchId: string;

  beforeEach(async () => {
    batchId = crypto.randomUUID();
    await apply(batchId, { type: 'dispose', drinkId: cola, fromLocationId: office, quantity: 1, reason: 'breakage' });
  });

  it('stores photos for the batch and serves them back', async () => {
    const [id] = await addBatchPhotos(db, { id: staffId, role: 'staff' }, batchId, [{ contentType: 'image/jpeg', data: jpeg }]);
    const photo = await getPhoto(db, id);
    expect(photo?.contentType).toBe('image/jpeg');
    expect([...new Uint8Array(photo!.data)]).toEqual([...jpeg]);
    const [m] = await listMovements(db, { type: 'dispose' }, 1);
    expect(m.photoIds).toEqual([id]);
  });

  it('allows at most 3 photos per batch', async () => {
    const photo = { contentType: 'image/jpeg' as const, data: jpeg };
    await addBatchPhotos(db, { id: staffId, role: 'staff' }, batchId, [photo, photo]);
    await expect(addBatchPhotos(db, { id: staffId, role: 'staff' }, batchId, [photo, photo])).rejects.toThrow(
      'too_many_photos',
    );
  });

  it("lets only the person who entered it or an admin add photos, and only to 破損・廃棄", async () => {
    const other = await insertStaff(db, '太郎', 'staff');
    const admin = await insertStaff(db, '店長', 'admin');
    const photo = { contentType: 'image/jpeg' as const, data: jpeg };
    await expect(addBatchPhotos(db, { id: other, role: 'staff' }, batchId, [photo])).rejects.toThrow('photo_not_allowed');
    await addBatchPhotos(db, { id: admin, role: 'admin' }, batchId, [photo]);

    const receiveBatch = crypto.randomUUID();
    await apply(receiveBatch, { type: 'receive', drinkId: cola, toLocationId: office, quantity: 1 });
    await expect(addBatchPhotos(db, { id: staffId, role: 'staff' }, receiveBatch, [photo])).rejects.toThrow(
      'photo_not_allowed',
    );
    await expect(addBatchPhotos(db, { id: staffId, role: 'staff' }, crypto.randomUUID(), [photo])).rejects.toThrow(
      'movement_not_found',
    );
  });
});
