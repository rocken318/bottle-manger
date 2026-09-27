'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { initialFormState } from '@/lib/formState';
import type { Location } from '@/lib/types';
import { createLocationAction, updateLocationAction } from './actions';
import { submitWithoutReset } from '@/lib/submitWithoutReset';

export function LocationCreateForm({ nextSortOrder }: { nextSortOrder: number }) {
  const [state, formAction, pending] = useActionState(createLocationAction, initialFormState);
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
      <h2 className="font-bold">拠点を追加</h2>
      <div className="flex gap-3">
        <label className="flex-1">
          <span className="mb-1 block text-sm">拠点名</span>
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

export function LocationEditForm({ location }: { location: Location }) {
  const [state, formAction, pending] = useActionState(updateLocationAction, initialFormState);
  const [name, setName] = useState(location.name);
  const [sortOrder, setSortOrder] = useState(String(location.sortOrder));
  const [isActive, setIsActive] = useState(location.isActive);

  return (
    <form onSubmit={submitWithoutReset(formAction)} className="flex flex-wrap items-end gap-2 px-3 py-3">
      <input type="hidden" name="id" value={location.id} />
      <label className="flex-1">
        <span className="block text-xs text-gray-500">拠点名</span>
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
      <button disabled={pending} className="rounded bg-gray-700 px-3 py-1 text-sm text-white disabled:opacity-50">
        保存
      </button>
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
