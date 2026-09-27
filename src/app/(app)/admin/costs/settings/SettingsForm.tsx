'use client';

import { useActionState } from 'react';
import { initialFormState } from '@/lib/formState';
import type { CostSettings } from '@/lib/repo/settings';
import { saveCostSettingsAction } from '../actions';
import { submitWithoutReset } from '@/lib/submitWithoutReset';

export function CostSettingsForm({ settings }: { settings: CostSettings }) {
  const [state, formAction, pending] = useActionState(saveCostSettingsAction, initialFormState);
  return (
    <form onSubmit={submitWithoutReset(formAction)} className="space-y-3 rounded border bg-white p-4">
      <label className="block">
        <span className="mb-1 block text-sm">消費税率（%）</span>
        <input
          name="taxRate"
          inputMode="decimal"
          defaultValue={String(settings.taxRate)}
          required
          className="w-full rounded border px-3 py-2"
        />
      </label>
      <fieldset className="space-y-2">
        <legend className="text-sm font-bold">棚卸差異を強調する基準（どちらかに当てはまれば強調）</legend>
        <label className="block">
          <span className="mb-1 block text-sm">差異の本数（本以上）</span>
          <input
            name="varianceQtyThreshold"
            inputMode="numeric"
            defaultValue={String(settings.varianceQtyThreshold)}
            required
            className="w-full rounded border px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm">差異の金額（円以上）</span>
          <input
            name="varianceAmountThreshold"
            inputMode="numeric"
            defaultValue={String(settings.varianceAmountThreshold)}
            required
            className="w-full rounded border px-3 py-2"
          />
        </label>
      </fieldset>
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
        保存
      </button>
    </form>
  );
}
