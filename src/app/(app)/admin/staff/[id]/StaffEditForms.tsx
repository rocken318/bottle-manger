'use client';

import { useActionState, useState } from 'react';
import { initialFormState, type FormState } from '@/lib/formState';
import type { Location, Staff } from '@/lib/types';
import { resetPinAction, unlockStaffAction, updateStaffAction } from '../actions';

function Feedback({ state }: { state: FormState }) {
  if (state.error)
    return (
      <p role="alert" className="text-sm text-red-600">
        {state.error}
      </p>
    );
  if (state.message)
    return (
      <p aria-live="polite" className="text-sm text-green-700">
        {state.message}
      </p>
    );
  return null;
}

export function StaffEditForms({ staff, locations, isLocked }: { staff: Staff; locations: Location[]; isLocked: boolean }) {
  const [updateState, updateAction, updating] = useActionState(updateStaffAction, initialFormState);
  const [pinState, pinAction, resetting] = useActionState(resetPinAction, initialFormState);
  const [unlockState, unlockAction, unlocking] = useActionState(unlockStaffAction, initialFormState);

  const [name, setName] = useState(staff.name);
  const [role, setRole] = useState(staff.role);
  const [homeLocationId, setHomeLocationId] = useState(staff.homeLocationId ?? '');
  const [isActive, setIsActive] = useState(staff.isActive);
  const [pin, setPin] = useState('');

  return (
    <div className="space-y-4">
      <form action={updateAction} className="space-y-3 rounded border bg-white p-4">
        <input type="hidden" name="id" value={staff.id} />
        <label className="block">
          <span className="mb-1 block text-sm">名前</span>
          <input
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={50}
            className="w-full rounded border px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm">権限</span>
          <select
            name="role"
            value={role}
            onChange={(e) => setRole(e.target.value as Staff['role'])}
            className="w-full rounded border bg-white px-3 py-2"
          >
            <option value="staff">スタッフ</option>
            <option value="admin">管理者</option>
          </select>
        </label>
        <label className="block">
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
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="isActive"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          <span className="text-sm">有効（外すとログインできなくなります）</span>
        </label>
        <Feedback state={updateState} />
        <button disabled={updating} className="rounded bg-blue-600 px-4 py-2 font-bold text-white disabled:opacity-50">
          保存
        </button>
      </form>

      <form action={pinAction} className="space-y-3 rounded border bg-white p-4">
        <input type="hidden" name="id" value={staff.id} />
        <label className="block">
          <span className="mb-1 block text-sm">新しいPIN</span>
          <input
            name="pin"
            inputMode="numeric"
            pattern="\d{4,6}"
            required
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className="w-full rounded border px-3 py-2"
          />
        </label>
        <Feedback state={pinState} />
        <button disabled={resetting} className="rounded bg-gray-700 px-4 py-2 font-bold text-white disabled:opacity-50">
          PINを変更
        </button>
      </form>

      {isLocked && (
        <form action={unlockAction} className="space-y-3 rounded border border-red-300 bg-white p-4">
          <input type="hidden" name="id" value={staff.id} />
          <p className="text-sm text-red-700">PINを5回間違えたためロックされています。</p>
          <Feedback state={unlockState} />
          <button disabled={unlocking} className="rounded bg-red-600 px-4 py-2 font-bold text-white disabled:opacity-50">
            ロックを解除
          </button>
        </form>
      )}
    </div>
  );
}
