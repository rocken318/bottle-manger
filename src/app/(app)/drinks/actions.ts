'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin, requireStaff } from '@/lib/auth/current';
import { getDb } from '@/lib/db/client';
import { toUserMessage } from '@/lib/errors';
import type { FormState } from '@/lib/formState';
import { createDrink, setDrinkActive } from '@/lib/repo/drinks';
import { drinkCreateSchema } from '@/lib/validation';

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

export async function setDrinkActiveAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get('id') ?? '');
  const isActive = formData.get('isActive') === 'true';
  await setDrinkActive(getDb(), admin.id, id, isActive);
  revalidatePath('/', 'layout');
}
