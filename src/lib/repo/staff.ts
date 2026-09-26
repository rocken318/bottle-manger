import type { Db } from '../db/types';
import { hashPin } from '../auth/pin';
import { LOCK_DURATION_SECONDS } from '../auth/lockout';
import type { Role, Staff } from '../types';
import { writeAudit } from './audit';

const STAFF_COLUMNS = `id, name, role, home_location_id as "homeLocationId", is_active as "isActive",
  failed_pin_attempts as "failedPinAttempts", locked_until as "lockedUntil"`;

export async function listStaff(db: Db): Promise<Staff[]> {
  return db.query<Staff>(`select ${STAFF_COLUMNS} from staff order by is_active desc, name`);
}

export async function listLoginNames(db: Db): Promise<{ id: string; name: string }[]> {
  return db.query<{ id: string; name: string }>('select id, name from staff where is_active order by name');
}

export async function getStaffById(db: Db, id: string): Promise<Staff | null> {
  const rows = await db.query<Staff>(`select ${STAFF_COLUMNS} from staff where id = $1`, [id]);
  return rows[0] ?? null;
}

export async function getPinHash(db: Db, id: string): Promise<string | null> {
  const rows = await db.query<{ pinHash: string }>('select pin_hash as "pinHash" from staff where id = $1', [id]);
  return rows[0]?.pinHash ?? null;
}

/**
 * Atomically counts this login attempt. Returns the attempt number,
 * or null when the staff member is inactive, missing or currently locked.
 */
export async function reservePinAttempt(db: Db, id: string): Promise<number | null> {
  const rows = await db.query<{ attempt: number }>(
    `update staff set failed_pin_attempts = failed_pin_attempts + 1
      where id = $1 and is_active and (locked_until is null or locked_until <= now())
      returning failed_pin_attempts as "attempt"`,
    [id],
  );
  return rows[0]?.attempt ?? null;
}

export async function recordPinSuccess(db: Db, id: string): Promise<void> {
  await db.query('update staff set failed_pin_attempts = 0, locked_until = null where id = $1', [id]);
}

/** Locks the account only if it is not already locked. Returns whether it locked it. */
export async function lockStaff(db: Db, id: string): Promise<boolean> {
  const rows = await db.query<{ id: string }>(
    `update staff set failed_pin_attempts = 0, locked_until = now() + make_interval(secs => $2)
      where id = $1 and (locked_until is null or locked_until <= now())
      returning id`,
    [id, LOCK_DURATION_SECONDS],
  );
  return rows.length > 0;
}

export async function createStaff(
  db: Db,
  actorId: string | null,
  input: { name: string; pin: string; role: Role; homeLocationId: string | null },
): Promise<Staff> {
  const pinHash = await hashPin(input.pin);
  return db.transaction(async (tx) => {
    const [staff] = await tx.query<Staff>(
      `insert into staff (name, pin_hash, role, home_location_id) values ($1, $2, $3, $4)
       returning ${STAFF_COLUMNS}`,
      [input.name, pinHash, input.role, input.homeLocationId],
    );
    await writeAudit(tx, {
      staffId: actorId,
      action: 'staff.create',
      targetType: 'staff',
      targetId: staff.id,
      details: { name: input.name, role: input.role, homeLocationId: input.homeLocationId },
    });
    return staff;
  });
}

export async function updateStaff(
  db: Db,
  actorId: string,
  input: { id: string; name: string; role: Role; homeLocationId: string | null; isActive: boolean },
): Promise<void> {
  if (input.id === actorId && (input.role !== 'admin' || !input.isActive)) throw new Error('cannot_demote_self');
  await db.transaction(async (tx) => {
    await tx.query(`select pg_advisory_xact_lock(hashtextextended('admin-guard', 0))`);

    const willBeActiveAdmin = input.role === 'admin' && input.isActive;
    if (!willBeActiveAdmin) {
      const [current] = await tx.query<{ role: Role; isActive: boolean }>(
        `select role, is_active as "isActive" from staff where id = $1`,
        [input.id],
      );
      if (current?.role === 'admin' && current.isActive) {
        const [{ exists: hasOtherAdmin }] = await tx.query<{ exists: boolean }>(
          `select exists(select 1 from staff where role = 'admin' and is_active and id <> $1) as exists`,
          [input.id],
        );
        if (!hasOtherAdmin) throw new Error('last_admin');
      }
    }

    const rows = await tx.query(
      `update staff set name = $2, role = $3, home_location_id = $4, is_active = $5, updated_at = now()
        where id = $1 returning id`,
      [input.id, input.name, input.role, input.homeLocationId, input.isActive],
    );
    if (rows.length === 0) throw new Error('staff_not_found');
    await writeAudit(tx, {
      staffId: actorId,
      action: 'staff.update',
      targetType: 'staff',
      targetId: input.id,
      details: { name: input.name, role: input.role, homeLocationId: input.homeLocationId, isActive: input.isActive },
    });
  });
}

export async function resetPin(db: Db, actorId: string, id: string, pin: string): Promise<void> {
  const pinHash = await hashPin(pin);
  await db.transaction(async (tx) => {
    const rows = await tx.query(
      `update staff set pin_hash = $2, failed_pin_attempts = 0, locked_until = null, updated_at = now()
        where id = $1 returning id`,
      [id, pinHash],
    );
    if (rows.length === 0) throw new Error('staff_not_found');
    await writeAudit(tx, { staffId: actorId, action: 'staff.reset_pin', targetType: 'staff', targetId: id });
  });
}

export async function unlockStaff(db: Db, actorId: string, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const rows = await tx.query(
      'update staff set failed_pin_attempts = 0, locked_until = null where id = $1 returning id',
      [id],
    );
    if (rows.length === 0) throw new Error('staff_not_found');
    await writeAudit(tx, { staffId: actorId, action: 'staff.unlock', targetType: 'staff', targetId: id });
  });
}
