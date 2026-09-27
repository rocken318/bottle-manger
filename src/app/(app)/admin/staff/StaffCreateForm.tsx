'use client';

import { useActionState, useEffect, useState } from 'react';
import { initialFormState } from '@/lib/formState';
import { canAssignRole, ROLE_LABELS } from '@/lib/permissions';
import type { Location, Role } from '@/lib/types';
import { createStaffAction } from './actions';

const ROLES: Role[] = ['staff', 'admin', 'master'];

export function StaffCreateForm({ locations, viewerRole }: { locations: Location[]; viewerRole: Role }) {
  const [state, formAction, pending] = useActionState(createStaffAction, initialFormState);
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [role, setRole] = useState('staff');
  const [homeLocationId, setHomeLocationId] = useState('');

  useEffect(() => {
    if (state.message) {
      setName('');
      setPin('');
      setRole('staff');
      setHomeLocationId('');
    }
  }, [state]);

  return (
    <form action={formAction} className="space-y-3 rounded border bg-white p-4">
      <h2 className="font-bold">スタッフを登録</h2>
      <div className="grid grid-cols-2 gap-3">
        <label>
          <span className="mb-1 block text-sm">名前</span>
          <input
            name="name"
            required
            maxLength={50}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded border px-3 py-2"
          />
        </label>
        <label>
          <span className="mb-1 block text-sm">PIN</span>
          <input
            name="pin"
            inputMode="numeric"
            pattern="\d{4,6}"
            required
            autoComplete="off"
            placeholder="4〜6桁"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className="w-full rounded border px-3 py-2"
          />
        </label>
        <label>
          <span className="mb-1 block text-sm">権限</span>
          <select
            name="role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full rounded border bg-white px-3 py-2"
          >
            {ROLES.filter((r) => canAssignRole(viewerRole, r)).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-sm">所属拠点</span>
          <select
            name="homeLocationId"
            value={homeLocationId}
            onChange={(e) => setHomeLocationId(e.target.value)}
            className="w-full rounded border bg-white px-3 py-2"
          >
            <option value="">なし</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
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
        登録
      </button>
    </form>
  );
}
