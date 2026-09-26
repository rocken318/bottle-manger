import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/lib/db/types';
import { attemptLogin } from '@/lib/auth/login';
import { createStaff, getStaffById, updateStaff } from '@/lib/repo/staff';
import { createTestDb } from '../helpers/testDb';

let db: Db;
let staffId: string;

beforeEach(async () => {
  db = await createTestDb();
  staffId = (await createStaff(db, null, { name: '花子', pin: '5678', role: 'admin', homeLocationId: null })).id;
});

describe('attemptLogin', () => {
  it('succeeds with the right PIN and resets the counter', async () => {
    await attemptLogin(db, staffId, '0000');
    expect(await attemptLogin(db, staffId, '5678')).toEqual({ ok: true, staffId });
    expect((await getStaffById(db, staffId))?.failedPinAttempts).toBe(0);
  });

  it('rejects a wrong PIN', async () => {
    expect(await attemptLogin(db, staffId, '0000')).toEqual({ ok: false, reason: 'invalid' });
  });

  it('locks after five wrong PINs, even for the right PIN', async () => {
    for (let i = 0; i < 4; i++) {
      expect(await attemptLogin(db, staffId, '0000')).toEqual({ ok: false, reason: 'invalid' });
    }
    expect(await attemptLogin(db, staffId, '0000')).toEqual({ ok: false, reason: 'locked' });
    expect(await attemptLogin(db, staffId, '5678')).toEqual({ ok: false, reason: 'locked' });
    const logs = await db.query<{ action: string }>('select action from audit_logs order by created_at desc limit 1');
    expect(logs[0].action).toBe('login.locked');
  });

  it('allows logging in again after the lock expires', async () => {
    for (let i = 0; i < 5; i++) await attemptLogin(db, staffId, '0000');
    await db.query(`update staff set locked_until = now() - interval '1 second' where id = $1`, [staffId]);
    expect(await attemptLogin(db, staffId, '5678')).toEqual({ ok: true, staffId });
  });

  it('rejects inactive staff', async () => {
    const other = await createStaff(db, staffId, { name: '太郎', pin: '1111', role: 'staff', homeLocationId: null });
    await updateStaff(db, staffId, { id: other.id, name: '太郎', role: 'staff', homeLocationId: null, isActive: false });
    expect(await attemptLogin(db, other.id, '1111')).toEqual({ ok: false, reason: 'invalid' });
  });

  it('writes exactly one login.locked audit row when the counter is already at the limit, and none on a repeat while locked', async () => {
    await db.query('update staff set failed_pin_attempts = 5 where id = $1', [staffId]);
    expect(await attemptLogin(db, staffId, '0000')).toEqual({ ok: false, reason: 'locked' });
    const locked = await db.query<{ action: string }>(`select action from audit_logs where action = 'login.locked'`);
    expect(locked).toHaveLength(1);

    expect(await attemptLogin(db, staffId, '5678')).toEqual({ ok: false, reason: 'locked' });
    const lockedAfter = await db.query<{ action: string }>(
      `select action from audit_logs where action = 'login.locked'`,
    );
    expect(lockedAfter).toHaveLength(1);
  });
});
