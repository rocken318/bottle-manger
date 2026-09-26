'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/current';
import { getDb } from '@/lib/db/client';
import { toUserMessage } from '@/lib/errors';
import type { FormState } from '@/lib/formState';
import { createStaff, resetPin, unlockStaff, updateStaff } from '@/lib/repo/staff';
import { pinSchema, staffCreateSchema, staffUpdateSchema } from '@/lib/validation';

const optionalId = (v: FormDataEntryValue | null) => (typeof v === 'string' && v !== '' ? v : null);

export async function createStaffAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const parsed = staffCreateSchema.safeParse({
    name: formData.get('name'),
    pin: formData.get('pin'),
    role: formData.get('role'),
    homeLocationId: optionalId(formData.get('homeLocationId')),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await createStaff(getDb(), admin.id, parsed.data);
  } catch (e) {
    return { error: toUserMessage(e) };
  }
  revalidatePath('/', 'layout');
  return { message: `${parsed.data.name} を登録しました` };
}

export async function updateStaffAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const parsed = staffUpdateSchema.safeParse({
    id: formData.get('id'),
    name: formData.get('name'),
    role: formData.get('role'),
    homeLocationId: optionalId(formData.get('homeLocationId')),
    isActive: formData.get('isActive') === 'on',
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await updateStaff(getDb(), admin.id, parsed.data);
  } catch (e) {
    return { error: toUserMessage(e) };
  }
  revalidatePath('/', 'layout');
  return { message: '保存しました' };
}

export async function resetPinAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const id = String(formData.get('id') ?? '');
  const pin = pinSchema.safeParse(formData.get('pin'));
  if (!pin.success) return { error: pin.error.issues[0].message };
  try {
    await resetPin(getDb(), admin.id, id, pin.data);
  } catch (e) {
    return { error: toUserMessage(e) };
  }
  revalidatePath('/', 'layout');
  return { message: 'PINを変更し、ロックを解除しました' };
}

export async function unlockStaffAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  try {
    await unlockStaff(getDb(), admin.id, String(formData.get('id') ?? ''));
  } catch (e) {
    return { error: toUserMessage(e) };
  }
  revalidatePath('/', 'layout');
  return { message: 'ロックを解除しました' };
}
