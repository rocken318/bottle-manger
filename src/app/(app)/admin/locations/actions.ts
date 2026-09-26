'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/current';
import { getDb } from '@/lib/db/client';
import { toUserMessage } from '@/lib/errors';
import type { FormState } from '@/lib/formState';
import { createLocation, updateLocation } from '@/lib/repo/locations';
import { locationSchema, locationUpdateSchema } from '@/lib/validation';

export async function createLocationAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const parsed = locationSchema.safeParse({ name: formData.get('name'), sortOrder: formData.get('sortOrder') });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await createLocation(getDb(), admin.id, parsed.data);
  } catch (e) {
    return { error: toUserMessage(e) };
  }
  revalidatePath('/', 'layout');
  return { message: `${parsed.data.name} を追加しました` };
}

export async function updateLocationAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const parsed = locationUpdateSchema.safeParse({
    id: formData.get('id'),
    name: formData.get('name'),
    sortOrder: formData.get('sortOrder'),
    isActive: formData.get('isActive') === 'on',
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await updateLocation(getDb(), admin.id, parsed.data);
  } catch (e) {
    return { error: toUserMessage(e) };
  }
  revalidatePath('/', 'layout');
  return { message: '保存しました' };
}
