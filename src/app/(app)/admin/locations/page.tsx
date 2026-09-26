import Link from 'next/link';
import { requireAdmin } from '@/lib/auth/current';
import { getDb } from '@/lib/db/client';
import { listLocations } from '@/lib/repo/locations';
import { LocationCreateForm, LocationEditForm } from './LocationForms';

export default async function LocationsAdminPage() {
  await requireAdmin();
  const locations = await listLocations(getDb(), { includeInactive: true });
  const nextSortOrder = Math.max(0, ...locations.map((l) => l.sortOrder)) + 1;
  return (
    <div className="space-y-4">
      <Link href="/admin" className="text-sm text-blue-700 underline">
        ← 管理
      </Link>
      <LocationCreateForm nextSortOrder={nextSortOrder} />
      <p className="text-xs text-gray-600">
        無効にした拠点は入力や在庫一覧に表示されなくなります（過去の記録は残ります）。
      </p>
      <ul className="divide-y rounded border bg-white">
        {locations.map((l) => (
          <li key={l.id}>
            <LocationEditForm location={l} />
          </li>
        ))}
      </ul>
    </div>
  );
}
