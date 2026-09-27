'use client';

import { useActionState, useState } from 'react';
import { initialFormState } from '@/lib/formState';
import { loginAction } from './actions';
import { submitWithoutReset } from '@/lib/submitWithoutReset';

export function LoginForm({ names }: { names: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState(loginAction, initialFormState);
  const [staffId, setStaffId] = useState('');
  return (
    <form onSubmit={submitWithoutReset(formAction)} className="space-y-4 rounded-lg bg-white p-6 shadow">
      <label className="block">
        <span className="mb-1 block text-sm font-medium">名前</span>
        <select
          name="staffId"
          required
          value={staffId}
          onChange={(e) => setStaffId(e.target.value)}
          className="w-full rounded border px-3 py-2"
        >
          <option value="" disabled>
            選んでください
          </option>
          {names.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">PIN</span>
        <input
          name="pin"
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          pattern="\d{4,6}"
          required
          className="w-full rounded border px-3 py-2 tracking-widest"
        />
      </label>
      {state.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      <button disabled={pending} className="w-full rounded bg-blue-600 py-2 font-bold text-white disabled:opacity-50">
        ログイン
      </button>
    </form>
  );
}
