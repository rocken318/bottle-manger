'use client';

import { useActionState } from 'react';
import { initialFormState } from '@/lib/formState';
import { setDrinkActiveAction } from './actions';

export function DrinkActiveToggle({ id, isActive }: { id: string; isActive: boolean }) {
  const [state, formAction, pending] = useActionState(setDrinkActiveAction, initialFormState);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="isActive" value={String(!isActive)} />
      <button disabled={pending} className="text-sm text-blue-700 underline disabled:opacity-50">
        {isActive ? '廃止' : '復活'}
      </button>
      {state.error && (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      )}
    </form>
  );
}
