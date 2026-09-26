'use client';

import { useActionState, useEffect, useState } from 'react';
import { initialFormState } from '@/lib/formState';
import { createDrinkAction } from './actions';

export function DrinkCreateForm() {
  const [state, formAction, pending] = useActionState(createDrinkAction, initialFormState);
  const [name, setName] = useState('');
  const [unitsPerCase, setUnitsPerCase] = useState('24');

  useEffect(() => {
    if (state.message) {
      setName('');
      setUnitsPerCase('24');
    }
  }, [state]);

  return (
    <form action={formAction} className="space-y-3 rounded border bg-white p-4">
      <h2 className="font-bold">ボトルを登録</h2>
      <div className="flex flex-wrap gap-3">
        <label className="flex-1">
          <span className="mb-1 block text-sm">ボトル名</span>
          <input
            name="name"
            required
            maxLength={50}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded border px-3 py-2"
          />
        </label>
        <label className="w-32">
          <span className="mb-1 block text-sm">1ケースの本数</span>
          <input
            name="unitsPerCase"
            type="number"
            inputMode="numeric"
            min={1}
            value={unitsPerCase}
            onChange={(e) => setUnitsPerCase(e.target.value)}
            required
            className="w-full rounded border px-3 py-2"
          />
        </label>
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      {state.message && (
        <p aria-live="polite" className="text-sm text-green-700">
          {state.message}
        </p>
      )}
      <button disabled={pending} className="rounded bg-blue-600 px-4 py-2 font-bold text-white disabled:opacity-50">
        登録
      </button>
    </form>
  );
}
