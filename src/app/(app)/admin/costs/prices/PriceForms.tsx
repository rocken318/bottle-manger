'use client';

import { useActionState, useState } from 'react';
import { initialFormState } from '@/lib/formState';
import { deletePriceAction, savePriceAction } from '../actions';

export function PriceCreateForm({
  drinks,
  today,
}: {
  drinks: { id: string; name: string; unitsPerCase: number }[];
  today: string;
}) {
  const [state, formAction, pending] = useActionState(savePriceAction, initialFormState);
  const [drinkId, setDrinkId] = useState(drinks[0]?.id ?? '');
  const [mode, setMode] = useState<'unit' | 'case'>('unit');
  const drink = drinks.find((d) => d.id === drinkId);

  return (
    <form action={formAction} className="space-y-3 rounded border bg-white p-4">
      <h2 className="font-bold">卸価格を登録</h2>
      <label className="block">
        <span className="mb-1 block text-sm">ボトル</span>
        <select
          name="drinkId"
          value={drinkId}
          onChange={(e) => setDrinkId(e.target.value)}
          required
          className="w-full rounded border px-3 py-2"
        >
          {drinks.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-sm">適用開始日</span>
        <input
          type="date"
          name="effectiveFrom"
          defaultValue={today}
          required
          className="w-full rounded border px-3 py-2"
        />
      </label>
      <fieldset className="flex gap-4 text-sm">
        <legend className="mb-1 text-sm">入力する単価</legend>
        <label className="flex items-center gap-1">
          <input type="radio" name="mode" value="unit" checked={mode === 'unit'} onChange={() => setMode('unit')} />
          1本あたり
        </label>
        <label className="flex items-center gap-1">
          <input type="radio" name="mode" value="case" checked={mode === 'case'} onChange={() => setMode('case')} />
          1ケースあたり{drink ? `（${drink.unitsPerCase}本）` : ''}
        </label>
      </fieldset>
      <label className="block">
        <span className="mb-1 block text-sm">{mode === 'unit' ? '1本の卸価格（税抜・円）' : '1ケースの卸価格（税抜・円）'}</span>
        <input name="amount" inputMode="decimal" required className="w-full rounded border px-3 py-2" />
      </label>
      {mode === 'case' && (
        <p className="text-xs text-gray-600">1ケースの本数で割り、小数第2位まで（四捨五入）の1本単価で保存します。</p>
      )}
      <p className="text-xs text-gray-600">同じボトル・同じ適用開始日で登録すると上書きします。</p>
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
      <button
        disabled={pending || drinks.length === 0}
        className="rounded bg-blue-600 px-4 py-2 font-bold text-white disabled:opacity-50"
      >
        登録
      </button>
    </form>
  );
}

export function PriceDeleteButton({ id, label }: { id: string; label: string }) {
  const [state, formAction, pending] = useActionState(deletePriceAction, initialFormState);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm(`${label} を削除しますか？`)) e.preventDefault();
      }}
      className="inline"
    >
      <input type="hidden" name="id" value={id} />
      <button disabled={pending} aria-label={`${label} を削除`} className="text-sm text-red-700 underline disabled:opacity-50">
        削除
      </button>
      {state.error && (
        <span role="alert" className="ml-2 text-xs text-red-600">
          {state.error}
        </span>
      )}
    </form>
  );
}
