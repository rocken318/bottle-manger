import Link from 'next/link';
import { requireAdmin } from '@/lib/auth/current';
import { ROLE_LABELS } from '@/lib/permissions';
import { getDb } from '@/lib/db/client';
import { listLocations } from '@/lib/repo/locations';
import { listStaff } from '@/lib/repo/staff';
import { StaffCreateForm } from './StaffCreateForm';
import { PageHelp } from '../../PageHelp';

export default async function StaffAdminPage() {
  const viewer = await requireAdmin();
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
      <PageHelp>
        <p className="font-bold">登録と一覧</p>
        <ul>
          <li>新しい人は名前・PIN（4〜6桁の数字）・権限・所属拠点を入れて「登録」を押します。PINは本人に伝えてください。</li>
          <li>所属拠点を選んでおくと、その人の「入力」画面で最初からその拠点が選ばれます。</li>
          <li>一覧の名前を押すと、その人の編集画面が開きます。「ロック中」はPINを5回まちがえた人です。</li>
        </ul>
        <p className="font-bold">権限について</p>
        <ul>
          <li>スタッフ：在庫の確認・入力・履歴・ボトル登録ができます。</li>
          <li>管理者：スタッフの管理と、管理画面（拠点・原価など）が使えます。変更できるのは「スタッフ」の人だけです。</li>
          <li>マスター：管理者・マスターを任命したり外したりでき、管理者のPINも再設定できます。</li>
        </ul>
      </PageHelp>
      <StaffCreateForm locations={locations.filter((l) => l.isActive)} viewerRole={viewer.role} />
      <ul className="divide-y rounded border bg-white">
        {staff.map((s) => (
          <li key={s.id}>
            <Link href={`/admin/staff/${s.id}`} className="flex items-center justify-between px-3 py-3">
              <span className={s.isActive ? '' : 'text-gray-400 line-through'}>
                {s.name}
                <span className="ml-2 text-xs text-gray-500">
                  {ROLE_LABELS[s.role]}
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
