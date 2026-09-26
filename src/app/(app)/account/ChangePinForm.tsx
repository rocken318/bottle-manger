'use client';

import { useActionState, useEffect, useState } from 'react';
import { initialFormState } from '@/lib/formState';
import { changeOwnPinAction } from './actions';

const PIN_INPUT = 'w-full rounded border px-3 py-2 tracking-widest';

export function ChangePinForm() {
  const [state, formAction, pending] = useActionState(changeOwnPinAction, initialFormState);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  useEffect(() => {
    if (state.message) {
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
    }
  }, [state]);

  return (
    <form action={formAction} className="space-y-3 rounded border bg-white p-4">
      <h2 className="font-bold">PINを変更</h2>
      <label className="block">
        <span className="mb-1 block text-sm">現在のPIN</span>
        <input
          name="currentPin"
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          pattern="\d{4,6}"
          required
          value={currentPin}
          onChange={(e) => setCurrentPin(e.target.value)}
          className={PIN_INPUT}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm">新しいPIN</span>
        <input
          name="newPin"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          pattern="\d{4,6}"
          required
          value={newPin}
          onChange={(e) => setNewPin(e.target.value)}
          className={PIN_INPUT}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm">新しいPIN（確認）</span>
        <input
          name="confirmPin"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          pattern="\d{4,6}"
          required
          value={confirmPin}
          onChange={(e) => setConfirmPin(e.target.value)}
          className={PIN_INPUT}
        />
      </label>
      <p className="text-xs text-gray-600">PINは4〜6桁の数字です。</p>
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
        PINを変更
      </button>
    </form>
  );
}
