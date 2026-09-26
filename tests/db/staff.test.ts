import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/lib/db/types';
import { listAuditLogs } from '@/lib/repo/audit';
import {
  changeOwnPin,
  createStaff,
  getStaffById,
  listLoginNames,
  listStaff,
  lockStaff,
  resetPin,
  unlockStaff,
  updateStaff,
} from '@/lib/repo/staff';
import { verifyPin } from '@/lib/auth/pin';
import { createTestDb, locationIdByName } from '../helpers/testDb';

let db: Db;
let adminId: string;

beforeEach(async () => {
  db = await createTestDb();
  adminId = (await createStaff(db, null, { name: '管理者', pin: '1234', role: 'admin', homeLocationId: null })).id;
});

describe('staff repository', () => {
  it('creates staff with a hashed PIN and logs it', async () => {
    const home = await locationIdByName(db, 'Kingyo');
    const s = await createStaff(db, adminId, { name: '花子', pin: '5678', role: 'staff', homeLocationId: home });
    expect(s).toMatchObject({ name: '花子', role: 'staff', homeLocationId: home, isActive: true });
    const [row] = await db.query<{ pin_hash: string }>('select pin_hash from staff where id = $1', [s.id]);
    expect(await verifyPin('5678', row.pin_hash)).toBe(true);
    const logs = await listAuditLogs(db, 10);
    expect(logs[0]).toMatchObject({ action: 'staff.create', staffName: '管理者', targetId: s.id });
  });

  it('rejects a duplicate active name', async () => {
    await expect(
      createStaff(db, adminId, { name: '管理者', pin: '1111', role: 'staff', homeLocationId: null }),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('lists only active staff for login', async () => {
    const s = await createStaff(db, adminId, { name: '花子', pin: '5678', role: 'staff', homeLocationId: null });
    await updateStaff(db, adminId, { id: s.id, name: '花子', role: 'staff', homeLocationId: null, isActive: false });
    expect((await listLoginNames(db)).map((r) => r.name)).toEqual(['管理者']);
    expect((await listStaff(db)).map((r) => r.name).sort()).toEqual(['管理者', '花子'].sort());
  });

  it('does not let an admin demote or deactivate themselves', async () => {
    await expect(
      updateStaff(db, adminId, { id: adminId, name: '管理者', role: 'staff', homeLocationId: null, isActive: true }),
    ).rejects.toThrow('cannot_demote_self');
    await expect(
      updateStaff(db, adminId, { id: adminId, name: '管理者', role: 'admin', homeLocationId: null, isActive: false }),
    ).rejects.toThrow('cannot_demote_self');
  });

  it('resets a PIN and clears the lock', async () => {
    const s = await createStaff(db, adminId, { name: '花子', pin: '5678', role: 'staff', homeLocationId: null });
    await db.query(
      `update staff set failed_pin_attempts = 3, locked_until = now() + interval '1 hour' where id = $1`,
      [s.id],
    );
    await resetPin(db, adminId, s.id, '9999');
    const after = await getStaffById(db, s.id);
    expect(after).toMatchObject({ failedPinAttempts: 0, lockedUntil: null });
    const [row] = await db.query<{ pin_hash: string }>('select pin_hash from staff where id = $1', [s.id]);
    expect(await verifyPin('9999', row.pin_hash)).toBe(true);
    const logs = await listAuditLogs(db, 1);
    expect(logs[0]).toMatchObject({ action: 'staff.reset_pin', targetId: s.id, details: { name: '花子' } });
  });

  it('prevents demoting the last remaining active admin', async () => {
    const staffMember = await createStaff(db, adminId, {
      name: '花子',
      pin: '5678',
      role: 'staff',
      homeLocationId: null,
    });
    await expect(
      updateStaff(db, staffMember.id, {
        id: adminId,
        name: '管理者',
        role: 'staff',
        homeLocationId: null,
        isActive: true,
      }),
    ).rejects.toThrow('last_admin');
    await expect(
      updateStaff(db, staffMember.id, {
        id: adminId,
        name: '管理者',
        role: 'admin',
        homeLocationId: null,
        isActive: false,
      }),
    ).rejects.toThrow('last_admin');
  });

  it('allows demoting an admin when another active admin remains', async () => {
    const b = await createStaff(db, adminId, { name: 'B', pin: '2222', role: 'admin', homeLocationId: null });
    await updateStaff(db, adminId, { id: b.id, name: 'B', role: 'staff', homeLocationId: null, isActive: true });
    expect((await getStaffById(db, b.id))?.role).toBe('staff');
  });

  it('locks a staff member only if not already locked', async () => {
    const s = await createStaff(db, adminId, { name: '花子', pin: '5678', role: 'staff', homeLocationId: null });
    expect(await lockStaff(db, s.id)).toBe(true);
    const first = (await getStaffById(db, s.id))?.lockedUntil;
    expect(await lockStaff(db, s.id)).toBe(false);
    const second = (await getStaffById(db, s.id))?.lockedUntil;
    expect(second?.getTime()).toBe(first?.getTime());
  });

  it('unlocks staff', async () => {
    const s = await createStaff(db, adminId, { name: '花子', pin: '5678', role: 'staff', homeLocationId: null });
    await db.query(`update staff set locked_until = now() + interval '1 hour' where id = $1`, [s.id]);
    await unlockStaff(db, adminId, s.id);
    expect((await getStaffById(db, s.id))?.lockedUntil).toBeNull();
    const logs = await listAuditLogs(db, 1);
    expect(logs[0]).toMatchObject({ action: 'staff.unlock', targetId: s.id, details: { name: '花子' } });
  });

  it('clamps out-of-range audit log limits instead of erroring', async () => {
    await expect(listAuditLogs(db, 0)).resolves.not.toThrow();
    await expect(listAuditLogs(db, -1)).resolves.not.toThrow();
    await expect(listAuditLogs(db, 999999)).resolves.not.toThrow();
  });

  describe('changeOwnPin', () => {
    const pinHashOf = async (id: string) =>
      (await db.query<{ pin_hash: string }>('select pin_hash from staff where id = $1', [id]))[0].pin_hash;

    it('changes the PIN when the current PIN is right and logs it', async () => {
      const s = await createStaff(db, adminId, { name: '花子', pin: '5678', role: 'staff', homeLocationId: null });
      await changeOwnPin(db, s.id, '5678', '2468');
      const hash = await pinHashOf(s.id);
      expect(await verifyPin('2468', hash)).toBe(true);
      expect(await verifyPin('5678', hash)).toBe(false);
      const [log] = await listAuditLogs(db, 1);
      expect(log).toMatchObject({
        action: 'staff.change_pin',
        staffName: '花子',
        targetType: 'staff',
        targetId: s.id,
        details: { name: '花子' },
      });
    });

    it('rejects a wrong current PIN without changing anything', async () => {
      const s = await createStaff(db, adminId, { name: '花子', pin: '5678', role: 'staff', homeLocationId: null });
      await expect(changeOwnPin(db, s.id, '0000', '2468')).rejects.toThrow('wrong_current_pin');
      expect(await verifyPin('5678', await pinHashOf(s.id))).toBe(true);
      expect((await listAuditLogs(db, 100)).filter((l) => l.action === 'staff.change_pin')).toHaveLength(0);
    });

    it('rejects a new PIN that is the same as the current one', async () => {
      const s = await createStaff(db, adminId, { name: '花子', pin: '5678', role: 'staff', homeLocationId: null });
      await expect(changeOwnPin(db, s.id, '5678', '5678')).rejects.toThrow('same_pin');
    });

    it('rejects an invalid new PIN format', async () => {
      const s = await createStaff(db, adminId, { name: '花子', pin: '5678', role: 'staff', homeLocationId: null });
      await expect(changeOwnPin(db, s.id, '5678', '12')).rejects.toThrow('invalid_pin_format');
    });

    it('throws staff_not_found for a missing staff member', async () => {
      await expect(changeOwnPin(db, crypto.randomUUID(), '1234', '2468')).rejects.toThrow('staff_not_found');
    });
  });
});
