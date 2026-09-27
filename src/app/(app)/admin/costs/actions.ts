'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/current';
import { formatUnitPrice } from '@/lib/costs/money';
import { getDb } from '@/lib/db/client';
import { toUserMessage } from '@/lib/errors';
import type { FormState } from '@/lib/formState';
import { deletePrice, savePrice } from '@/lib/repo/prices';
import { updateCostSettings } from '@/lib/repo/settings';
import { costSettingsSchema, priceCreateSchema } from '@/lib/validation';

export async function savePriceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const parsed = priceCreateSchema.safeParse({
    drinkId: formData.get('drinkId'),
    effectiveFrom: formData.get('effectiveFrom'),
    mode: formData.get('mode'),
    amount: formData.get('amount') ?? '',
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  let result: Awaited<ReturnType<typeof savePrice>>;
  try {
    result = await savePrice(getDb(), admin.id, parsed.data);
  } catch (e) {
    return { error: toUserMessage(e) };
  }
  revalidatePath('/admin', 'layout');
  const price = `1本 ${formatUnitPrice(result.unitCents)}円（${parsed.data.effectiveFrom}から）`;
  if (result.action === 'none') return { message: `変更はありません：${price}` };
  return { message: `${result.action === 'update' ? '上書きしました' : '登録しました'}：${price}` };
}

export async function deletePriceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const id = z.uuid().safeParse(formData.get('id'));
  if (!id.success) return { error: '不正な ID です' };
  try {
    await deletePrice(getDb(), admin.id, id.data);
  } catch (e) {
    return { error: toUserMessage(e) };
  }
  revalidatePath('/admin', 'layout');
  return { message: '削除しました' };
}

export async function saveCostSettingsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const parsed = costSettingsSchema.safeParse({
    taxRate: formData.get('taxRate') ?? '',
    varianceQtyThreshold: formData.get('varianceQtyThreshold') ?? '',
    varianceAmountThreshold: formData.get('varianceAmountThreshold') ?? '',
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await updateCostSettings(getDb(), admin.id, parsed.data);
  } catch (e) {
    return { error: toUserMessage(e) };
  }
  revalidatePath('/admin', 'layout');
  return { message: '保存しました' };
}
