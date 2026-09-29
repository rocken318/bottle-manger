'use client';

import { useActionState, useEffect, useState } from 'react';
import { initialFormState } from '@/lib/formState';
import type { Category } from '@/lib/types';
import { createDrinkAction } from './actions';
import { submitWithoutReset } from '@/lib/submitWithoutReset';

export function DrinkCreateForm({ categories }: { categories: Category[] }) {
  const [state, formAction, pending] = useActionState(createDrinkAction, initialFormState);
  const [name, setName] = useState('');
  const [unitsPerCase, setUnitsPerCase] = useState('24');
  const [categoryId, setCategoryId] = useState('');

  useEffect(() => {
    if (state.message) {
      setName('');
      setUnitsPerCase('24');
      setCategoryId('');
    }
  }, [state]);

  return (
    <form onSubmit={submitWithoutReset(formAction)} className="space-y-3 rounded border bg-white p-4">
      <h2 className="font-bold">ボトルを登録</h2>
      {/* ボトル名は横並びにすると幅が潰れて打ちにくいので、1 行まるごと使う。 */}
      <label className="block">
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
      <div className="flex flex-wrap gap-3">
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
        <label className="min-w-44 flex-1">
          <span className="mb-1 block text-sm">種類</span>
          <select
            name="categoryId"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full rounded border bg-white px-3 py-2"
          >
            <option value="">未分類</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
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
