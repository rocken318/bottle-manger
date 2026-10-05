'use client';

import { useActionState, useState } from 'react';
import { initialFormState } from '@/lib/formState';
import { daysRemaining, expiryLabel, isExpired } from '@/lib/keep';
import { submitWithoutReset } from '@/lib/submitWithoutReset';
import type { KeepBottle } from '@/lib/types';
import { dropKeepAction, touchKeepAction, updateKeepNoteAction } from './actions';

export function KeepRow({ bottle, today }: { bottle: KeepBottle; today: string }) {
  const isActive = bottle.status === 'active';
  const remaining = daysRemaining(bottle.lastUsedOn, today);
  const expired = isActive && isExpired(remaining);

  const [touchState, touchAction, touching] = useActionState(touchKeepAction, initialFormState);
  const [noteState, noteAction, savingNote] = useActionState(updateKeepNoteAction, initialFormState);
  const [dropState, dropAction, dropping] = useActionState(dropKeepAction, initialFormState);
  const [note, setNote] = useState(bottle.note);
  const [confirmingDrop, setConfirmingDrop] = useState(false);

  const error = touchState.error ?? noteState.error ?? dropState.error;

  return (
    <li className="space-y-2 rounded border bg-white p-3" data-testid="keep-row">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-bold">
          {bottle.customerName} <span className="font-normal text-gray-700">／ {bottle.drinkName}</span>
        </p>
        {isActive ? (
          <p className={`text-sm ${expired ? 'font-bold text-red-600' : 'text-gray-700'}`}>{expiryLabel(remaining)}</p>
        ) : (
          <p className="text-sm text-gray-600">{bottle.droppedOn} に期限切れ</p>
        )}
      </div>
      <p className="text-xs text-gray-600">
        登録 {bottle.registeredOn}　最終利用 {bottle.lastUsedOn}
      </p>

      {isActive ? (
        <>
          <form onSubmit={submitWithoutReset(noteAction)} className="flex gap-2">
            <input type="hidden" name="id" value={bottle.id} />
            <input
              name="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              aria-label={`${bottle.customerName}のメモ`}
              placeholder="メモ"
              className="min-w-0 flex-1 rounded border px-2 py-1 text-sm"
            />
            <button disabled={savingNote || note === bottle.note} className="text-sm text-blue-700 underline disabled:opacity-40">
              メモを保存
            </button>
          </form>
          <div className="flex flex-wrap items-center gap-4">
            <form onSubmit={submitWithoutReset(touchAction)}>
              <input type="hidden" name="id" value={bottle.id} />
              <button disabled={touching} className="text-sm text-blue-700 underline disabled:opacity-50">
                今日使った（最終利用日を今日にする）
              </button>
            </form>
            {confirmingDrop ? (
              <form onSubmit={submitWithoutReset(dropAction)} className="flex items-center gap-2">
                <input type="hidden" name="id" value={bottle.id} />
                <button disabled={dropping} className="rounded bg-red-600 px-2 py-1 text-sm font-bold text-white disabled:opacity-50">
                  本当に期限切れにする
                </button>
                <button type="button" onClick={() => setConfirmingDrop(false)} className="text-sm text-gray-600 underline">
                  やめる
                </button>
              </form>
            ) : (
              <button type="button" onClick={() => setConfirmingDrop(true)} className="text-sm text-red-700 underline">
                期限切れにする
              </button>
            )}
          </div>
        </>
      ) : (
        bottle.note && <p className="text-sm text-gray-700">メモ：{bottle.note}</p>
      )}

      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
      {(touchState.message || noteState.message) && !error && (
        <p aria-live="polite" className="text-xs text-green-700">
          {touchState.message ?? noteState.message}
        </p>
      )}
    </li>
  );
}
