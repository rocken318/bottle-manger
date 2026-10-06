import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/lib/db/types';
import { listAuditLogs } from '@/lib/repo/audit';
import {
  createKeepBottle,
  dropKeepBottle,
  listKeepBottles,
  touchKeepBottle,
  updateKeepNote,
} from '@/lib/repo/keepBottles';
import { createTestDb, insertDrink, insertStaff } from '../helpers/testDb';

let db: Db;
let staffId: string;
let drinkId: string;

beforeEach(async () => {
  db = await createTestDb();
  staffId = await insertStaff(db);
  drinkId = await insertDrink(db, '白州');
});

const input = (over: Partial<Parameters<typeof createKeepBottle>[2]> = {}) => ({
  customerName: '田中様',
  drinkId,
  registeredOn: '2026-10-01',
  note: '',
  ...over,
});

describe('keep bottles repository', () => {
  it('creates a bottle with the drink name copied and last use = registration date', async () => {
    const b = await createKeepBottle(db, staffId, input({ note: '氷多め' }));
    expect(b).toMatchObject({
      customerName: '田中様',
      drinkId,
      drinkName: '白州',
      registeredOn: '2026-10-01',
      lastUsedOn: '2026-10-01',
      status: 'active',
      droppedOn: null,
      note: '氷多め',
    });
    expect((await listAuditLogs(db, 1))[0]).toMatchObject({ action: 'keep.create', targetId: b.id });
  });

  it('rejects an unknown or deactivated drink', async () => {
    await expect(
      createKeepBottle(db, staffId, input({ drinkId: '00000000-0000-4000-8000-000000000000' })),
    ).rejects.toThrow('drink_not_found');
    await db.query('update drinks set is_active = false where id = $1', [drinkId]);
    await expect(createKeepBottle(db, staffId, input())).rejects.toThrow('inactive_drink');
  });

  it('keeps showing the copied name after the drink is renamed or deactivated', async () => {
    const b = await createKeepBottle(db, staffId, input());
    await db.query(`update drinks set name = '白州12年', is_active = false where id = $1`, [drinkId]);
    const [row] = await listKeepBottles(db, 'active');
    expect(row).toMatchObject({ id: b.id, drinkName: '白州' });
  });

  it('lists active bottles oldest last use first, and dropped ones newest drop first', async () => {
    const a = await createKeepBottle(db, staffId, input({ customerName: 'A', registeredOn: '2026-09-01' }));
    const b = await createKeepBottle(db, staffId, input({ customerName: 'B', registeredOn: '2026-08-01' }));
    const c = await createKeepBottle(db, staffId, input({ customerName: 'C', registeredOn: '2026-07-01' }));
    expect((await listKeepBottles(db, 'active')).map((x) => x.id)).toEqual([c.id, b.id, a.id]);

    await dropKeepBottle(db, staffId, c.id, '2026-10-01');
    await dropKeepBottle(db, staffId, a.id, '2026-10-03');
    expect((await listKeepBottles(db, 'active')).map((x) => x.id)).toEqual([b.id]);
    expect((await listKeepBottles(db, 'dropped')).map((x) => x.id)).toEqual([a.id, c.id]);
    expect((await listKeepBottles(db, 'dropped'))[0]).toMatchObject({ status: 'dropped', droppedOn: '2026-10-03' });
  });

  it('touches the last use date and logs it', async () => {
    const b = await createKeepBottle(db, staffId, input());
    await touchKeepBottle(db, staffId, b.id, '2026-10-05');
    expect((await listKeepBottles(db, 'active'))[0]).toMatchObject({ lastUsedOn: '2026-10-05', registeredOn: '2026-10-01' });
    expect((await listAuditLogs(db, 1))[0]).toMatchObject({ action: 'keep.touch', targetId: b.id });
  });

  it('never moves the last use date back before registration (future registration date)', async () => {
    const b = await createKeepBottle(db, staffId, input({ registeredOn: '2026-12-01' }));
    await touchKeepBottle(db, staffId, b.id, '2026-10-05');
    expect((await listKeepBottles(db, 'active'))[0].lastUsedOn).toBe('2026-12-01');
  });

  it('updates the note while active, up to 500 characters', async () => {
    const b = await createKeepBottle(db, staffId, input());
    await updateKeepNote(db, staffId, b.id, '来月誕生日');
    expect((await listKeepBottles(db, 'active'))[0].note).toBe('来月誕生日');
    await expect(updateKeepNote(db, staffId, b.id, 'あ'.repeat(501))).rejects.toMatchObject({ code: '23514' });
  });

  it('refuses touch, note and drop on a dropped or unknown bottle', async () => {
    const b = await createKeepBottle(db, staffId, input());
    await dropKeepBottle(db, staffId, b.id, '2026-10-05');
    await expect(touchKeepBottle(db, staffId, b.id, '2026-10-06')).rejects.toThrow('keep_not_active');
    await expect(updateKeepNote(db, staffId, b.id, 'x')).rejects.toThrow('keep_not_active');
    await expect(dropKeepBottle(db, staffId, b.id, '2026-10-06')).rejects.toThrow('keep_not_active');
    const missing = '00000000-0000-4000-8000-000000000000';
    await expect(touchKeepBottle(db, staffId, missing, '2026-10-06')).rejects.toThrow('keep_not_found');
    await expect(updateKeepNote(db, staffId, missing, 'x')).rejects.toThrow('keep_not_found');
    await expect(dropKeepBottle(db, staffId, missing, '2026-10-06')).rejects.toThrow('keep_not_found');
  });

  it('keeps the drop date consistent with the status (check constraint)', async () => {
    const b = await createKeepBottle(db, staffId, input());
    await expect(
      db.query(`update keep_bottles set status = 'dropped' where id = $1`, [b.id]),
    ).rejects.toThrow(/keep_dropped_on_matches_status/);
  });

  it('does not let a drink with keep bottles be deleted', async () => {
    await createKeepBottle(db, staffId, input());
    await expect(db.query('delete from drinks where id = $1', [drinkId])).rejects.toMatchObject({ code: '23001' }); // restrict_violation（on delete restrict）
  });
});
