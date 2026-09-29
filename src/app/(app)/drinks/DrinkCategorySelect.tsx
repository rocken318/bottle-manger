'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { initialFormState } from '@/lib/formState';
import type { Category } from '@/lib/types';
import { setDrinkCategoryAction } from './actions';

/**
 * 選んだ瞬間に保存するプルダウン。251本を順に分類していく作業なので、
 * 「編集」を開いて「保存」を押す往復をさせない。
 */
export function DrinkCategorySelect({
  drinkId,
  drinkName,
  categoryId,
  categories,
}: {
  drinkId: string;
  drinkName: string;
  categoryId: string | null;
  categories: Category[];
}) {
  const [state, formAction, pending] = useActionState(setDrinkCategoryAction, initialFormState);
  const [value, setValue] = useState(categoryId ?? '');
  const formRef = useRef<HTMLFormElement>(null);

  // 保存に失敗したら選択を元に戻す（画面の表示と DB がずれたままにしない）。
  useEffect(() => {
    if (state.error) setValue(categoryId ?? '');
  }, [state, categoryId]);

  return (
    <form ref={formRef} action={formAction} className="flex items-center gap-1">
      <input type="hidden" name="drinkId" value={drinkId} />
      <select
        name="categoryId"
        value={value}
        disabled={pending}
        aria-label={`${drinkName}の種類`}
        onChange={(e) => {
          setValue(e.target.value);
          // requestSubmit で action を発火（onChange 内の直接呼び出しは React が警告する）
          formRef.current?.requestSubmit();
        }}
        className={`rounded border px-2 py-1 text-sm ${value === '' ? 'bg-amber-50 text-amber-800' : 'bg-white'} disabled:opacity-50`}
      >
        <option value="">未分類</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      {state.error && (
        <span role="alert" className="text-xs text-red-600">
          {state.error}
        </span>
      )}
    </form>
  );
}
