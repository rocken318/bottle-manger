import type { Db } from '../db/types';
import { writeAudit } from '../repo/audit';
import { getPinHash, getStaffById, lockStaff, recordPinSuccess, reservePinAttempt } from '../repo/staff';
import { mayVerify, shouldLockAfterFailure } from './lockout';
import { verifyPin } from './pin';

export type LoginResult = { ok: true; staffId: string } | { ok: false; reason: 'invalid' | 'locked' };

export async function attemptLogin(db: Db, staffId: string, pin: string): Promise<LoginResult> {
  const attempt = await reservePinAttempt(db, staffId);
  if (attempt === null) {
    const staff = await getStaffById(db, staffId);
    return { ok: false, reason: staff?.isActive ? 'locked' : 'invalid' };
  }
  if (!mayVerify(attempt)) {
    if (await lockStaff(db, staffId)) {
      await writeAudit(db, { staffId, action: 'login.locked', targetType: 'staff', targetId: staffId });
    }
    return { ok: false, reason: 'locked' };
  }

  const hash = await getPinHash(db, staffId);
  if (hash && (await verifyPin(pin, hash))) {
    await recordPinSuccess(db, staffId);
    return { ok: true, staffId };
  }

  if (shouldLockAfterFailure(attempt)) {
    if (await lockStaff(db, staffId)) {
      await writeAudit(db, { staffId, action: 'login.locked', targetType: 'staff', targetId: staffId });
    }
    return { ok: false, reason: 'locked' };
  }
  return { ok: false, reason: 'invalid' };
}
