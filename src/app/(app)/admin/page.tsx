import Link from 'next/link';
import { requireAdmin } from '@/lib/auth/current';
import { formatDateTime } from '@/lib/dates';
import { getDb } from '@/lib/db/client';
import { listAuditLogs } from '@/lib/repo/audit';

const ACTION_LABELS: Record<string, string> = {
  'staff.create': 'スタッフ登録',
  'staff.update': 'スタッフ変更',
  'staff.reset_pin': 'PINリセット',
  'staff.unlock': 'ロック解除',
  'drink.create': 'ドリンク登録',
  'drink.deactivate': 'ドリンク廃止',
  'drink.activate': 'ドリンク復活',
  'location.create': '拠点追加',
  'location.update': '拠点変更',
  'movement.void': '在庫記録の取り消し',
  'login.locked': 'PIN誤りでロック',
};

export default async function AdminPage() {
  await requireAdmin();
  const logs = await listAuditLogs(getDb(), 100);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Link href="/admin/staff" className="rounded border bg-white p-4 text-center font-bold">
          スタッフ管理
        </Link>
        <Link href="/admin/locations" className="rounded border bg-white p-4 text-center font-bold">
          拠点管理
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
              {typeof log.details.name === 'string' && `：${log.details.name}`}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
