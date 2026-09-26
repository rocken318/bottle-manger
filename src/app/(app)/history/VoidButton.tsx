'use client';

import { useState, useTransition } from 'react';
import { voidMovementAction } from './actions';

export function VoidButton({ movementId }: { movementId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className="text-sm text-red-600 underline">
        取り消し
      </button>
    );
  }
  return (
    <span className="flex items-center gap-2 text-sm">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await voidMovementAction(movementId);
            if (res.error) setError(res.error);
          })
        }
        className="rounded bg-red-600 px-2 py-1 text-white disabled:opacity-50"
      >
        本当に取り消す
      </button>
      <button type="button" onClick={() => setConfirming(false)} className="text-gray-600 underline">
        やめる
      </button>
      {error && <span className="text-red-600">{error}</span>}
    </span>
  );
}
