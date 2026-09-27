import type { Role } from './types';

export const VOID_WINDOW_MS = 24 * 60 * 60 * 1000;

export function canVoid(
  movement: { staffId: string; createdAt: Date; voidedAt: Date | null },
  actor: { id: string; role: Role },
  now: Date = new Date(),
): boolean {
  if (movement.voidedAt) return false;
  if (isAdminRole(actor.role)) return true;
  return movement.staffId === actor.id && now.getTime() - movement.createdAt.getTime() <= VOID_WINDOW_MS;
}

export const ROLE_LABELS: Record<Role, string> = { master: 'マスター', admin: '管理者', staff: 'スタッフ' };

/** Admins and masters can use the admin area. */
export function isAdminRole(role: Role): boolean {
  return role === 'admin' || role === 'master';
}

/** Only a master can give out (or take away) the admin and master roles. */
export function canAssignRole(actor: Role, role: Role): boolean {
  return actor === 'master' || (actor === 'admin' && role === 'staff');
}

/** Editing someone's name, role, home location or active flag: masters edit anyone, admins only staff (and themselves). */
export function canEditStaff(actor: Role, target: Role, isSelf: boolean): boolean {
  if (isSelf) return true;
  return actor === 'master' || (actor === 'admin' && target === 'staff');
}

/**
 * Setting someone else's PIN: admins only for staff, masters for staff and admins. Nobody can set a
 * master's PIN from the admin screen (the master changes it on the account page; if forgotten, the
 * developer runs `npm run db:staff -- pin`), so that a master account cannot be taken over from the app.
 */
export function canResetPin(actor: Role, target: Role): boolean {
  if (target === 'master') return false;
  return actor === 'master' || (actor === 'admin' && target === 'staff');
}
