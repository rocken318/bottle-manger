import { requireStaff } from '@/lib/auth/current';
import { formatDateTime } from '@/lib/dates';
import { getDb } from '@/lib/db/client';
import { describeMovement, MOVEMENT_TYPE_LABELS } from '@/lib/movementLabels';
import { movementFilterToQuery, parseMovementFilter } from '@/lib/movementFilter';
import { canVoid } from '@/lib/permissions';
import { listDrinks } from '@/lib/repo/drinks';
import { listLocations } from '@/lib/repo/locations';
import { listMovements } from '@/lib/repo/movements';
import { listStaff } from '@/lib/repo/staff';
import type { MovementType } from '@/lib/types';
import { VoidButton } from './VoidButton';

const PAGE_LIMIT = 200;

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await requireStaff();
  const filter = parseMovementFilter(await searchParams);
  const db = getDb();
  const [movements, locations, drinks, staffList] = await Promise.all([
    listMovements(db, filter, PAGE_LIMIT),
    listLocations(db, { includeInactive: true }),
    listDrinks(db, { includeInactive: true }),
    listStaff(db),
  ]);
  const now = new Date();
  const query = movementFilterToQuery(filter);

  return (
    <div className="space-y-4">
      <form className="grid grid-cols-2 gap-2 rounded border bg-white p-3 text-sm sm:grid-cols-3">
        <select name="location" defaultValue={filter.locationId ?? ''} aria-label="拠点" className="rounded border px-2 py-2">
          <option value="">すべての拠点</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <select name="drink" defaultValue={filter.drinkId ?? ''} aria-label="ドリンク" className="rounded border px-2 py-2">
          <option value="">すべてのドリンク</option>
          {drinks.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <select name="staff" defaultValue={filter.staffId ?? ''} aria-label="スタッフ" className="rounded border px-2 py-2">
          <option value="">すべてのスタッフ</option>
          {staffList.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select name="type" defaultValue={filter.type ?? ''} aria-label="種類" className="rounded border px-2 py-2">
          <option value="">すべての種類</option>
          {(Object.keys(MOVEMENT_TYPE_LABELS) as MovementType[]).map((t) => (
            <option key={t} value={t}>
              {MOVEMENT_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <input type="date" name="from" defaultValue={filter.fromDate ?? ''} aria-label="開始日" className="rounded border px-2 py-2" />
        <input type="date" name="to" defaultValue={filter.toDate ?? ''} aria-label="終了日" className="rounded border px-2 py-2" />
        {filter.fromDate && filter.toDate && filter.fromDate > filter.toDate && (
          <p className="col-span-2 text-xs text-red-600 sm:col-span-3">開始日が終了日より後になっています</p>
        )}
        <div className="col-span-2 flex items-center gap-3 sm:col-span-3">
          <button className="flex-1 rounded bg-blue-600 py-2 font-bold text-white">絞り込む</button>
          <a href="/history" className="text-sm text-blue-700 underline">
            条件をクリア
          </a>
        </div>
      </form>

      <div className="flex justify-between text-sm">
        <span className="text-gray-600">
          {movements.length}件{movements.length === PAGE_LIMIT && `（新しい${PAGE_LIMIT}件のみ表示）`}
        </span>
        <a href={`/api/export/movements?${query}`} className="text-blue-700 underline">
          CSV出力
        </a>
      </div>

      <ul className="divide-y rounded border bg-white">
        {movements.map((m) => (
          <li key={m.id} className={`space-y-1 px-3 py-3 ${m.voidedAt ? 'text-gray-400' : ''}`}>
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>
                {formatDateTime(m.createdAt)}・{m.staffName}
              </span>
              <span className="rounded bg-gray-100 px-2">{MOVEMENT_TYPE_LABELS[m.type]}</span>
            </div>
            <p className={m.voidedAt ? 'line-through' : ''}>
              <span className="font-bold">{m.drinkName}</span> {describeMovement(m)}
            </p>
            {m.note && <p className="text-sm text-gray-600">メモ: {m.note}</p>}
            {m.voidedAt ? (
              <p className="text-xs">
                取り消し済み（{formatDateTime(m.voidedAt)}・{m.voidedByName}）
              </p>
            ) : (
              canVoid(m, staff, now) && <VoidButton movementId={m.id} />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
