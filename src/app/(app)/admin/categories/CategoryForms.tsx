'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { initialFormState } from '@/lib/formState';
import type { Category } from '@/lib/types';
import { createCategoryAction, updateCategoryAction } from './actions';
import { submitWithoutReset } from '@/lib/submitWithoutReset';

export function CategoryCreateForm({ nextSortOrder }: { nextSortOrder: number }) {
  const [state, formAction, pending] = useActionState(createCategoryAction, initialFormState);
  const [name, setName] = useState('');
  const [sortOrder, setSortOrder] = useState(String(nextSortOrder));
  const nextSortOrderRef = useRef(nextSortOrder);
  nextSortOrderRef.current = nextSortOrder;

  useEffect(() => {
    if (state.message) {
      setName('');
      setSortOrder(String(nextSortOrderRef.current));
    }
  }, [state]);

  return (
    <form onSubmit={submitWithoutReset(formAction)} className="space-y-3 rounded border bg-white p-4">
      <h2 className="font-bold">種類を追加</h2>
      <div className="flex gap-3">
        <label className="flex-1">
          <span className="mb-1 block text-sm">種類の名前</span>
          <input
            name="name"
            required
            maxLength={50}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded border px-3 py-2"
          />
        </label>
        <label className="w-24">
          <span className="mb-1 block text-sm">表示順</span>
          <input
            name="sortOrder"
            type="number"
            min={0}
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
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
        追加
      </button>
    </form>
  );
}

export function CategoryEditForm({ category, drinkCount }: { category: Category; drinkCount: number }) {
  const [state, formAction, pending] = useActionState(updateCategoryAction, initialFormState);
  const [name, setName] = useState(category.name);
  const [sortOrder, setSortOrder] = useState(String(category.sortOrder));
  const [isActive, setIsActive] = useState(category.isActive);

  return (
    <form onSubmit={submitWithoutReset(formAction)} className="flex flex-wrap items-end gap-2 px-3 py-3">
      <input type="hidden" name="id" value={category.id} />
      <label className="flex-1">
        <span className="block text-xs text-gray-500">種類の名前</span>
        <input
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={50}
          className="w-full rounded border px-2 py-1"
        />
      </label>
      <label className="w-20">
        <span className="block text-xs text-gray-500">表示順</span>
        <input
          name="sortOrder"
          type="number"
          min={0}
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
          className="w-full rounded border px-2 py-1"
        />
      </label>
      <label className="flex items-center gap-1 text-sm">
        <input type="checkbox" name="isActive" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        有効
      </label>
      <span className="text-xs text-gray-500">{drinkCount}本</span>
      <button disabled={pending} className="rounded bg-gray-700 px-3 py-1 text-sm text-white disabled:opacity-50">
        保存
      </button>
      {!isActive && category.isActive && drinkCount > 0 && (
        <p className="w-full text-xs text-amber-700">
          保存すると、この種類の{drinkCount}本は「未分類」として扱われます（ボトル自体は消えません）。
        </p>
      )}
      {state.error && (
        <p role="alert" className="w-full text-sm text-red-600">
          {state.error}
        </p>
      )}
      {state.message && (
        <p aria-live="polite" className="w-full text-sm text-green-700">
          {state.message}
        </p>
      )}
    </form>
  );
}
