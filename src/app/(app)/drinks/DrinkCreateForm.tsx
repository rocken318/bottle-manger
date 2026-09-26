'use client';

import { useActionState } from 'react';
import { initialFormState } from '@/lib/formState';
import { createDrinkAction } from './actions';

export function DrinkCreateForm() {
  const [state, formAction, pending] = useActionState(createDrinkAction, initialFormState);
  return (
    <form action={formAction} className="space-y-3 rounded border bg-white p-4">
      <h2 className="font-bold">ドリンクを登録</h2>
      <div className="flex flex-wrap gap-3">
        <label className="flex-1">
          <span className="mb-1 block text-sm">ドリンク名</span>
          <input name="name" required maxLength={50} className="w-full rounded border px-3 py-2" />
        </label>
        <label className="w-32">
          <span className="mb-1 block text-sm">1ケースの本数</span>
          <input
            name="unitsPerCase"
            type="number"
            inputMode="numeric"
            min={1}
            defaultValue={24}
            required
            className="w-full rounded border px-3 py-2"
          />
        </label>
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.message && <p className="text-sm text-green-700">{state.message}</p>}
      <button disabled={pending} className="rounded bg-blue-600 px-4 py-2 font-bold text-white disabled:opacity-50">
        登録
      </button>
    </form>
  );
}
