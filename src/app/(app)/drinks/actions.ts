'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdmin, requireStaff } from '@/lib/auth/current';
import { getDb } from '@/lib/db/client';
import { toUserMessage } from '@/lib/errors';
import type { FormState } from '@/lib/formState';
import { createDrink, setDrinkActive } from '@/lib/repo/drinks';
import { drinkCreateSchema, idSchema } from '@/lib/validation';

export async function createDrinkAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const staff = await requireStaff();
  const parsed = drinkCreateSchema.safeParse({
    name: formData.get('name'),
    unitsPerCase: formData.get('unitsPerCase'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await createDrink(getDb(), staff.id, parsed.data);
  } catch (e) {
    return { error: toUserMessage(e) };
  }
  revalidatePath('/', 'layout');
  return { message: `${parsed.data.name} を登録しました` };
}

const setDrinkActiveSchema = z.object({
  id: idSchema,
  isActive: z.enum(['true', 'false']),
});

export async function setDrinkActiveAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const parsed = setDrinkActiveSchema.safeParse({
    id: formData.get('id'),
    isActive: formData.get('isActive'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await setDrinkActive(getDb(), admin.id, parsed.data.id, parsed.data.isActive === 'true');
  } catch (e) {
    return { error: toUserMessage(e) };
  }
  revalidatePath('/', 'layout');
  return { message: parsed.data.isActive === 'true' ? '復活しました' : '廃止しました' };
}
