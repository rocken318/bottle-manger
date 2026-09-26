import type { Role } from './types';

export const VOID_WINDOW_MS = 24 * 60 * 60 * 1000;

export function canVoid(
  movement: { staffId: string; createdAt: Date; voidedAt: Date | null },
  actor: { id: string; role: Role },
  now: Date = new Date(),
): boolean {
  if (movement.voidedAt) return false;
  if (actor.role === 'admin') return true;
  return movement.staffId === actor.id && now.getTime() - movement.createdAt.getTime() <= VOID_WINDOW_MS;
}
