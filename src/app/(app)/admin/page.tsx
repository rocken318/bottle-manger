import Link from 'next/link';
import { describeAuditDetails } from '@/lib/auditDetails';
import { requireAdmin } from '@/lib/auth/current';
import { formatDateTime } from '@/lib/dates';
import { getDb } from '@/lib/db/client';
import { listAuditLogs } from '@/lib/repo/audit';
import { PageHelp } from '../PageHelp';

const ACTION_LABELS: Record<string, string> = {
  'staff.create': 'スタッフ登録',
  'staff.update': 'スタッフ変更',
  'staff.reset_pin': 'PINリセット',
  'staff.unlock': 'ロック解除',
  'drink.create': 'ボトル登録',
  'drink.deactivate': 'ボトル廃止',
  'drink.activate': 'ボトル復活',
  'drink.update': 'ボトル編集',
  'staff.change_pin': '自分のPIN変更',
  'location.create': '拠点追加',
  'location.update': '拠点変更',
  'category.create': '種類追加',
  'category.update': '種類変更',
  'drink.category': 'ボトルの種類変更',
  'drink.import': 'ボトル一括取り込み',
  'drink.delete': 'ボトル削除',
  'movement.void': '在庫記録の取り消し',
  'login.locked': 'PIN誤りでロック',
  'price.create': '卸価格登録',
  'price.update': '卸価格上書き',
  'price.delete': '卸価格削除',
  'settings.update': '原価の設定変更',
};

export default async function AdminPage() {
  await requireAdmin();
  const logs = await listAuditLogs(getDb(), 100);
  return (
    <div className="space-y-4">
      <PageHelp>
        <ul>
          <li>この画面は管理者・マスターだけが使えます。</li>
          <li>「スタッフ管理」：スタッフの登録、権限・所属拠点の変更、PINの再設定、ロック解除をします。</li>
          <li>「拠点管理」：拠点（お店や倉庫）の追加、名前・表示順の変更、無効化をします。</li>
          <li>「お酒の種類」：焼酎・ウイスキーなどの種類を追加・改名・無効化します。どのボトルがどの種類かは「ボトル」の画面で変えます。</li>
          <li>「原価・棚卸差異」：月ごとの原価やロス（棚卸差異）を金額で確認します。卸価格の登録もここでします。</li>
          <li>「在庫一覧をCSV出力」を押すと、今の在庫をファイルでダウンロードできます（Excelなどで開けます）。</li>
          <li>「操作ログ」には、だれがいつ何をしたか（登録・変更・取り消し・ロックなど）が新しい順に100件表示されます。</li>
        </ul>
      </PageHelp>
      <div className="grid grid-cols-2 gap-3">
        <Link href="/admin/staff" className="rounded border bg-white p-4 text-center font-bold">
          スタッフ管理
        </Link>
        <Link href="/admin/locations" className="rounded border bg-white p-4 text-center font-bold">
          拠点管理
        </Link>
        <Link href="/admin/categories" className="rounded border bg-white p-4 text-center font-bold">
          お酒の種類
        </Link>
        <Link href="/admin/costs" className="rounded border bg-white p-4 text-center font-bold">
          原価・棚卸差異
        </Link>
      </div>
      <a href="/api/export/stock" className="block text-sm text-blue-700 underline">
        在庫一覧をCSV出力
      </a>
      <h2 className="font-bold">操作ログ（新しい100件）</h2>
      {logs.length === 0 ? (
        <p className="text-sm text-gray-500">操作ログはまだありません</p>
      ) : (
        <ul className="divide-y rounded border bg-white text-sm">
          {logs.map((log) => (
            <li key={log.id} className="px-3 py-2">
              <span className="text-xs text-gray-500">{formatDateTime(log.createdAt)}</span>{' '}
              <span className="font-bold">{log.staffName ?? 'システム'}</span>{' '}
              {ACTION_LABELS[log.action] ?? log.action}
              {describeAuditDetails(log) !== null && `：${describeAuditDetails(log)}`}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
