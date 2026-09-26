import Link from 'next/link';
import { requireAdmin } from '@/lib/auth/current';
import { getDb } from '@/lib/db/client';
import { listLocations } from '@/lib/repo/locations';
import { listStaff } from '@/lib/repo/staff';
import { StaffCreateForm } from './StaffCreateForm';

export default async function StaffAdminPage() {
  await requireAdmin();
  const db = getDb();
  const [staff, locations] = await Promise.all([listStaff(db), listLocations(db, { includeInactive: true })]);
  const locationName = new Map(locations.map((l) => [l.id, l.name]));
  const now = Date.now();
  return (
    <div className="space-y-4">
      <Link href="/admin" className="text-sm text-blue-700 underline">
        ← 管理
      </Link>
      <h1 className="text-lg font-bold">スタッフ一覧</h1>
      <StaffCreateForm locations={locations.filter((l) => l.isActive)} />
      <ul className="divide-y rounded border bg-white">
        {staff.map((s) => (
          <li key={s.id}>
            <Link href={`/admin/staff/${s.id}`} className="flex items-center justify-between px-3 py-3">
              <span className={s.isActive ? '' : 'text-gray-400 line-through'}>
                {s.name}
                <span className="ml-2 text-xs text-gray-500">
                  {s.role === 'admin' ? '管理者' : 'スタッフ'}
                  {s.homeLocationId && `・${locationName.get(s.homeLocationId)}`}
                </span>
              </span>
              {s.lockedUntil && s.lockedUntil.getTime() > now && (
                <span className="rounded bg-red-100 px-2 text-xs text-red-700">ロック中</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
