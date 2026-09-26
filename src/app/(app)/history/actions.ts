'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireStaff } from '@/lib/auth/current';
import { getDb } from '@/lib/db/client';
import { toUserMessage } from '@/lib/errors';
import { canVoid } from '@/lib/permissions';
import { getMovementForVoid, voidMovement } from '@/lib/repo/movements';

export async function voidMovementAction(movementId: string): Promise<{ error?: string }> {
  const staff = await requireStaff();
  const parsed = z.string().uuid().safeParse(movementId);
  if (!parsed.success) return { error: '記録が見つかりません' };
  const db = getDb();
  try {
    const movement = await getMovementForVoid(db, parsed.data);
    if (!movement) return { error: '記録が見つかりません' };
    if (!canVoid(movement, staff)) {
      return { error: '取り消せるのは自分の入力（24時間以内）だけです。管理者に依頼してください' };
    }
    await voidMovement(db, parsed.data, staff.id);
  } catch (e) {
    // Even on failure (e.g. the movement was voided moments ago by someone else), revalidate so
    // a stale 取り消し button doesn't linger for the user.
    revalidatePath('/', 'layout');
    return { error: toUserMessage(e) };
  }
  revalidatePath('/', 'layout');
  return {};
}
