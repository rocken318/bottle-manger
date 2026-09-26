'use server';

import { revalidatePath } from 'next/cache';
import { requireStaff } from '@/lib/auth/current';
import { getDb } from '@/lib/db/client';
import { toUserMessage } from '@/lib/errors';
import { canVoid } from '@/lib/permissions';
import { getMovementForVoid, voidMovement } from '@/lib/repo/movements';

export async function voidMovementAction(movementId: string): Promise<{ error?: string }> {
  const staff = await requireStaff();
  const db = getDb();
  try {
    const movement = await getMovementForVoid(db, movementId);
    if (!movement) return { error: '記録が見つかりません' };
    if (!canVoid(movement, staff)) {
      return { error: '取り消せるのは自分の入力（24時間以内）だけです。管理者に依頼してください' };
    }
    await voidMovement(db, movementId, staff.id);
  } catch (e) {
    return { error: toUserMessage(e) };
  }
  revalidatePath('/', 'layout');
  return {};
}
