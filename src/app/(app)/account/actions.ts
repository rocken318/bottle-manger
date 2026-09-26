'use server';

import { requireStaff } from '@/lib/auth/current';
import { getDb } from '@/lib/db/client';
import { toUserMessage } from '@/lib/errors';
import type { FormState } from '@/lib/formState';
import { changeOwnPin } from '@/lib/repo/staff';
import { changePinSchema } from '@/lib/validation';

export async function changeOwnPinAction(_prev: FormState, formData: FormData): Promise<FormState> {
  // The staff id comes from the session only; never from the form.
  const staff = await requireStaff();
  const parsed = changePinSchema.safeParse({
    currentPin: formData.get('currentPin'),
    newPin: formData.get('newPin'),
    confirmPin: formData.get('confirmPin'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await changeOwnPin(getDb(), staff.id, parsed.data.currentPin, parsed.data.newPin);
  } catch (e) {
    return { error: toUserMessage(e) };
  }
  return { message: 'PINを変更しました' };
}
