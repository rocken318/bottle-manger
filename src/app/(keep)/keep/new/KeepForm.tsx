'use client';

import { useActionState, useState } from 'react';
import { initialFormState } from '@/lib/formState';
import { submitWithoutReset } from '@/lib/submitWithoutReset';
import type { Category, Drink } from '@/lib/types';
import { createKeepAction } from '../actions';
import { DrinkPicker } from './DrinkPicker';

export function KeepForm({ drinks, categories, today }: { drinks: Drink[]; categories: Category[]; today: string }) {
  const [state, formAction, pending] = useActionState(createKeepAction, initialFormState);
  const [drinkId, setDrinkId] = useState('');

  return (
    <form onSubmit={submitWithoutReset(formAction)} className="space-y-4 rounded border bg-white p-4">
      <h1 className="font-bold">キープボトルを登録</h1>
      <label className="block">
        <span className="mb-1 block text-sm">お客様名</span>
        <input name="customerName" required maxLength={50} className="w-full rounded border px-3 py-2" />
      </label>
      <DrinkPicker drinks={drinks} categories={categories} value={drinkId} onChange={setDrinkId} />
      <input type="hidden" name="drinkId" value={drinkId} />
      <label className="block">
        <span className="mb-1 block text-sm">登録日</span>
        <input name="registeredOn" type="date" required defaultValue={today} className="rounded border px-3 py-2" />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm">メモ（500文字まで）</span>
        <textarea name="note" maxLength={500} rows={3} className="w-full rounded border px-3 py-2" />
      </label>
      {state.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      <button disabled={pending} className="rounded bg-blue-600 px-4 py-2 font-bold text-white disabled:opacity-50">
        登録する
      </button>
    </form>
  );
}
