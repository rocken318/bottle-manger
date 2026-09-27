import type { Db } from '../db/types';
import { attemptLogin } from '../auth/login';
import { hashPin } from '../auth/pin';
import { LOCK_DURATION_SECONDS } from '../auth/lockout';
import { canAssignRole, canEditStaff, canResetPin, isAdminRole } from '../permissions';
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

/** Role of the acting staff member (null actor = a developer script, allowed everything). */
async function actorRole(db: Db, actorId: string | null): Promise<Role> {
  if (actorId === null) return 'master';
  const [row] = await db.query<{ role: Role }>('select role from staff where id = $1 and is_active', [actorId]);
  if (!row) throw new Error('forbidden_target');
  return row.role;
}

async function targetRole(db: Db, id: string): Promise<Role> {
  const [row] = await db.query<{ role: Role }>('select role from staff where id = $1', [id]);
  if (!row) throw new Error('staff_not_found');
  return row.role;
}

export async function createStaff(
  db: Db,
  actorId: string | null,
  input: { name: string; pin: string; role: Role; homeLocationId: string | null },
): Promise<Staff> {
  const pinHash = await hashPin(input.pin);
  return db.transaction(async (tx) => {
    if (!canAssignRole(await actorRole(tx, actorId), input.role)) throw new Error('forbidden_role');
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
  actorId: string | null,
  input: { id: string; name: string; role: Role; homeLocationId: string | null; isActive: boolean },
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.query(`select pg_advisory_xact_lock(hashtextextended('admin-guard', 0))`);

    const actor = await actorRole(tx, actorId);
    const [current] = await tx.query<{ role: Role; isActive: boolean }>(
      `select role, is_active as "isActive" from staff where id = $1`,
      [input.id],
    );
    if (!current) throw new Error('staff_not_found');
    const isSelf = input.id === actorId;
    if (isSelf && (input.role !== current.role || !input.isActive)) throw new Error('cannot_demote_self');
    if (!canEditStaff(actor, current.role, isSelf)) throw new Error('forbidden_target');
    if (input.role !== current.role && !(canAssignRole(actor, current.role) && canAssignRole(actor, input.role))) {
      throw new Error('forbidden_role');
    }

    // Keep at least one active admin-or-master, and at least one active master once there is one.
    const stays = (pred: (r: Role) => boolean) => input.isActive && pred(input.role);
    const othersExist = async (roles: Role[]) => {
      const [{ exists }] = await tx.query<{ exists: boolean }>(
        `select exists(select 1 from staff where role = any($2::text[]) and is_active and id <> $1) as exists`,
        [input.id, roles],
      );
      return exists;
    };
    if (current.isActive && isAdminRole(current.role) && !stays(isAdminRole) && !(await othersExist(['admin', 'master']))) {
      throw new Error('last_admin');
    }
    if (current.isActive && current.role === 'master' && !stays((r) => r === 'master') && !(await othersExist(['master']))) {
      throw new Error('last_master');
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

export async function resetPin(db: Db, actorId: string | null, id: string, pin: string): Promise<void> {
  const pinHash = await hashPin(pin);
  await db.transaction(async (tx) => {
    const actor = await actorRole(tx, actorId);
    const target = await targetRole(tx, id);
    // A developer script (actorId null) may reset anyone, including a master who forgot their PIN.
    if (actorId !== null && !canResetPin(actor, target)) {
      throw new Error(target === 'master' ? 'cannot_reset_master' : 'forbidden_target');
    }
    const rows = await tx.query<{ id: string; name: string }>(
      `update staff set pin_hash = $2, failed_pin_attempts = 0, locked_until = null, updated_at = now()
        where id = $1 returning id, name`,
      [id, pinHash],
    );
    const staff = rows[0];
    if (!staff) throw new Error('staff_not_found');
    await writeAudit(tx, {
      staffId: actorId,
      action: 'staff.reset_pin',
      targetType: 'staff',
      targetId: id,
      details: { name: staff.name },
    });
  });
}

export async function unlockStaff(db: Db, actorId: string | null, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    // Unlocking lets someone keep guessing the PIN, so it follows the same rule as editing.
    if (!canEditStaff(await actorRole(tx, actorId), await targetRole(tx, id), id === actorId)) {
      throw new Error('forbidden_target');
    }
    const rows = await tx.query<{ id: string; name: string }>(
      'update staff set failed_pin_attempts = 0, locked_until = null where id = $1 returning id, name',
      [id],
    );
    const staff = rows[0];
    if (!staff) throw new Error('staff_not_found');
    await writeAudit(tx, {
      staffId: actorId,
      action: 'staff.unlock',
      targetType: 'staff',
      targetId: id,
      details: { name: staff.name },
    });
  });
}

/**
 * Lets a logged-in staff member change their own PIN after confirming the current one.
 * Wrong current PINs count toward the same lockout as login (5 misses → locked for 15 minutes).
 */
export async function changeOwnPin(db: Db, staffId: string, currentPin: string, newPin: string): Promise<void> {
  // Counted outside the transaction so failed attempts are not rolled back.
  const result = await attemptLogin(db, staffId, currentPin);
  if (!result.ok) throw new Error(result.reason === 'locked' ? 'pin_locked' : 'wrong_current_pin');
  if (newPin === currentPin) throw new Error('same_pin');
  const pinHash = await hashPin(newPin);
  await db.transaction(async (tx) => {
    const rows = await tx.query<{ name: string }>(
      `update staff set pin_hash = $2, failed_pin_attempts = 0, updated_at = now()
        where id = $1 returning name`,
      [staffId, pinHash],
    );
    const staff = rows[0];
    if (!staff) throw new Error('staff_not_found');
    await writeAudit(tx, {
      staffId,
      action: 'staff.change_pin',
      targetType: 'staff',
      targetId: staffId,
      details: { name: staff.name },
    });
  });
}
