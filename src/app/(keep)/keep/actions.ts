'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireStaff } from '@/lib/auth/current';
import { getDb } from '@/lib/db/client';
import { toUserMessage } from '@/lib/errors';
import type { FormState } from '@/lib/formState';
import { todayJst } from '@/lib/keep';
import { createKeepBottle, dropKeepBottle, touchKeepBottle, updateKeepNote } from '@/lib/repo/keepBottles';
import { keepCreateSchema, keepIdSchema, keepNoteSchema } from '@/lib/validation';

export async function createKeepAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const staff = await requireStaff();
  const parsed = keepCreateSchema.safeParse({
    customerName: formData.get('customerName'),
    drinkId: formData.get('drinkId'),
    registeredOn: formData.get('registeredOn'),
    note: formData.get('note') ?? '',
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await createKeepBottle(getDb(), staff.id, parsed.data);
  } catch (e) {
    return { error: toUserMessage(e) };
  }
  revalidatePath('/keep');
  redirect('/keep');
}

export async function touchKeepAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const staff = await requireStaff();
  const parsed = keepIdSchema.safeParse({ id: formData.get('id') });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await touchKeepBottle(getDb(), staff.id, parsed.data.id, todayJst());
  } catch (e) {
    return { error: toUserMessage(e) };
  }
  revalidatePath('/keep');
  return { message: '最終利用日を今日にしました' };
}

export async function updateKeepNoteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const staff = await requireStaff();
  const parsed = keepNoteSchema.safeParse({ id: formData.get('id'), note: formData.get('note') ?? '' });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await updateKeepNote(getDb(), staff.id, parsed.data.id, parsed.data.note);
  } catch (e) {
    return { error: toUserMessage(e) };
  }
  revalidatePath('/keep');
  return { message: 'メモを保存しました' };
}

export async function dropKeepAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const staff = await requireStaff();
  const parsed = keepIdSchema.safeParse({ id: formData.get('id') });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await dropKeepBottle(getDb(), staff.id, parsed.data.id, todayJst());
  } catch (e) {
    return { error: toUserMessage(e) };
  }
  revalidatePath('/keep');
  return { message: '期限切れにしました' };
}
