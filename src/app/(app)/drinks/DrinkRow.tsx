'use client';

import { useActionState, useEffect, useState } from 'react';
import { initialFormState } from '@/lib/formState';
import type { Drink } from '@/lib/types';
import { updateDrinkAction } from './actions';
import { DrinkActiveToggle } from './DrinkActiveToggle';
import { submitWithoutReset } from '@/lib/submitWithoutReset';

type Props = { drink: Pick<Drink, 'id' | 'name' | 'unitsPerCase' | 'isActive'>; isAdmin: boolean };

export function DrinkRow({ drink, isAdmin }: Props) {
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <li className="space-y-2 px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`min-w-0 break-all ${drink.isActive ? '' : 'text-gray-400 line-through'}`}>
          {drink.name}
          <span className="ml-2 text-xs text-gray-500">1ケース{drink.unitsPerCase}本</span>
        </span>
        <div className="flex items-center gap-3">
          {!editing && (
            <button
              type="button"
              onClick={() => {
                setNotice(null);
                setEditing(true);
              }}
              aria-label={`${drink.name}を編集`}
              className="text-sm text-blue-700 underline"
            >
              編集
            </button>
          )}
          {isAdmin && <DrinkActiveToggle id={drink.id} isActive={drink.isActive} />}
        </div>
      </div>
      {editing && (
        <DrinkEditForm
          drink={drink}
          onCancel={() => setEditing(false)}
          onSaved={(message) => {
            setEditing(false);
            setNotice(message);
          }}
        />
      )}
      {notice && (
        <p aria-live="polite" className="text-sm text-green-700">
          {notice}
        </p>
      )}
    </li>
  );
}

function DrinkEditForm({
  drink,
  onCancel,
  onSaved,
}: {
  drink: Props['drink'];
  onCancel: () => void;
  onSaved: (message: string) => void;
}) {
  // Mounted fresh on every open, so the action state and fields start from the current props.
  const [state, formAction, pending] = useActionState(updateDrinkAction, initialFormState);
  const [name, setName] = useState(drink.name);
  const [unitsPerCase, setUnitsPerCase] = useState(String(drink.unitsPerCase));

  useEffect(() => {
    if (state.message) onSaved(state.message);
    // onSaved is recreated on every parent render; only react to a new action result.
  }, [state]);

  return (
    <form onSubmit={submitWithoutReset(formAction)} className="space-y-2 rounded border bg-gray-50 p-3">
      <input type="hidden" name="id" value={drink.id} />
      <div className="flex flex-wrap gap-2">
        <label className="min-w-0 flex-1">
          <span className="mb-1 block text-xs text-gray-600">名前</span>
          <input
            name="name"
            required
            maxLength={50}
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label={`${drink.name}の名前`}
            className="w-full rounded border bg-white px-3 py-2"
          />
        </label>
        <label className="w-28">
          <span className="mb-1 block text-xs text-gray-600">1ケースの本数</span>
          <input
            name="unitsPerCase"
            type="number"
            inputMode="numeric"
            min={1}
            required
            value={unitsPerCase}
            onChange={(e) => setUnitsPerCase(e.target.value)}
            aria-label={`${drink.name}の1ケースの本数`}
            className="w-full rounded border bg-white px-3 py-2"
          />
        </label>
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      <div className="flex gap-2">
        <button disabled={pending} className="rounded bg-blue-600 px-4 py-2 font-bold text-white disabled:opacity-50">
          保存
        </button>
        <button type="button" onClick={onCancel} className="rounded border bg-white px-4 py-2">
          キャンセル
        </button>
      </div>
    </form>
  );
}
