'use server';

import { redirect } from 'next/navigation';
import { attemptLogin } from '@/lib/auth/login';
import { clearSessionCookie, setSessionCookie } from '@/lib/auth/current';
import { getDb } from '@/lib/db/client';
import type { FormState } from '@/lib/formState';
import { loginSchema } from '@/lib/validation';

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({ staffId: formData.get('staffId'), pin: formData.get('pin') });
  if (!parsed.success) return { error: '名前を選び、4〜6桁のPINを入力してください' };

  const result = await attemptLogin(getDb(), parsed.data.staffId, parsed.data.pin);
  if (!result.ok) {
    return {
      error:
        result.reason === 'locked'
          ? 'PINを5回間違えたため、15分間ログインできません。急ぐ場合は管理者に解除を頼んでください'
          : 'PINが違います',
    };
  }
  await setSessionCookie(result.staffId);
  redirect('/');
}

export async function logoutAction(): Promise<void> {
  await clearSessionCookie();
  redirect('/login');
}
