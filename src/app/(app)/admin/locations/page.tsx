import Link from 'next/link';
import { requireAdmin } from '@/lib/auth/current';
import { getDb } from '@/lib/db/client';
import { listLocations } from '@/lib/repo/locations';
import { LocationCreateForm, LocationEditForm } from './LocationForms';
import { PageHelp } from '../../PageHelp';

export default async function LocationsAdminPage() {
  await requireAdmin();
  const locations = await listLocations(getDb(), { includeInactive: true });
  const nextSortOrder = Math.max(0, ...locations.map((l) => l.sortOrder)) + 1;
  return (
    <div className="space-y-4">
      <Link href="/admin" className="text-sm text-blue-700 underline">
        ← 管理
      </Link>
      <PageHelp>
        <ul>
          <li>新しい拠点は「拠点名」を入れて「追加」を押します。</li>
          <li>「表示順」は小さい数ほど上（左）に表示されます。</li>
          <li>名前や表示順を変えたら、その行の「保存」を押します。</li>
          <li>使わなくなった拠点は「有効」のチェックを外して「保存」します。過去の記録は残ります。</li>
          <li>在庫が残っている拠点は無効にできません。移動や棚卸で0本にしてから無効にしてください。</li>
          <li>もう一度使うときは「有効」にチェックを入れて「保存」します。</li>
        </ul>
      </PageHelp>
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
