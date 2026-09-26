import Link from 'next/link';
import { costFilterToQuery, type CostFilter } from '@/lib/costs/period';
import type { Location } from '@/lib/types';

type Tab = 'monthly' | 'variance' | 'prices' | 'settings';

const TABS: { key: Tab; label: string; path: string; keepsFilter: boolean }[] = [
  { key: 'monthly', label: '月次集計', path: '/admin/costs', keepsFilter: true },
  { key: 'variance', label: '棚卸差異', path: '/admin/costs/variance', keepsFilter: true },
  { key: 'prices', label: '卸価格', path: '/admin/costs/prices', keepsFilter: false },
  { key: 'settings', label: '設定', path: '/admin/costs/settings', keepsFilter: false },
];

/** Header of every /admin/costs page: back link and tabs (the period filter carries over between reports). */
export function CostsNav({ current, filter }: { current: Tab; filter?: CostFilter }) {
  const query = filter ? `?${costFilterToQuery(filter)}` : '';
  return (
    <div className="space-y-3">
      <Link href="/admin" className="text-sm text-blue-700 underline">
        ← 管理
      </Link>
      <h1 className="text-lg font-bold">原価・棚卸差異</h1>
      <nav aria-label="原価・棚卸差異" className="flex overflow-x-auto rounded border bg-white text-sm">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`${t.path}${t.keepsFilter ? query : ''}`}
            aria-current={t.key === current ? 'page' : undefined}
            className={`flex-1 whitespace-nowrap px-3 py-2 text-center ${
              t.key === current ? 'bg-blue-600 font-bold text-white' : 'text-gray-700'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

/** GET form for the period (JST months) and location. */
export function CostFilterForm({
  action,
  filter,
  locations,
  notice,
}: {
  action: string;
  filter: CostFilter;
  locations: Location[];
  notice: string | null;
}) {
  return (
    <form
      key={costFilterToQuery(filter)}
      action={action}
      className="grid grid-cols-2 gap-2 rounded border bg-white p-3 text-sm sm:grid-cols-4"
    >
      <label>
        <span className="mb-1 block text-xs text-gray-600">開始月</span>
        <input type="month" name="from" defaultValue={filter.fromMonth} required className="w-full rounded border px-2 py-2" />
      </label>
      <label>
        <span className="mb-1 block text-xs text-gray-600">終了月</span>
        <input type="month" name="to" defaultValue={filter.toMonth} required className="w-full rounded border px-2 py-2" />
      </label>
      <label className="col-span-2 sm:col-span-1">
        <span className="mb-1 block text-xs text-gray-600">拠点</span>
        <select name="location" defaultValue={filter.locationId ?? ''} className="w-full rounded border px-2 py-2">
          <option value="">すべての拠点</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.isActive ? l.name : `${l.name}（無効）`}
            </option>
          ))}
        </select>
      </label>
      <div className="col-span-2 flex items-end sm:col-span-1">
        <button className="w-full rounded bg-blue-600 py-2 font-bold text-white">表示</button>
      </div>
      {notice && <p className="col-span-2 text-xs text-amber-700 sm:col-span-4">{notice}</p>}
    </form>
  );
}

export function CsvLinks({ filter }: { filter: CostFilter }) {
  const q = costFilterToQuery(filter);
  const links = [
    { href: `/api/export/costs/monthly?${q}`, label: '月次集計' },
    { href: `/api/export/costs/purchases?${q}`, label: '仕入明細' },
    { href: `/api/export/costs/variance?${q}`, label: '棚卸差異明細' },
    { href: `/api/export/costs/closing-stock?${q}`, label: '月末在庫明細' },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      <span className="text-gray-600">CSV出力:</span>
      {links.map((l) => (
        <a key={l.href} href={l.href} className="text-blue-700 underline">
          {l.label}
        </a>
      ))}
    </div>
  );
}

export function VoidNote() {
  return (
    <p className="text-xs text-gray-600">
      日付は日本時間で判定し、取り消した記録は含めません。過去の月の記録を後から取り消すと、その月の数字も変わります。金額は税抜（仕入の消費税・税込を除く）で、ボトルごとに1円未満を四捨五入しています。
    </p>
  );
}

export function MissingPriceWarning({ drinks }: { drinks: { id: string; name: string }[] }) {
  if (drinks.length === 0) return null;
  return (
    <div role="alert" className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <p className="font-bold">価格未設定のボトルがあります（{drinks.length}件）</p>
      <p>{drinks.map((d) => d.name).join('、')}</p>
      <p className="text-xs">
        これらのボトルが関わる金額は集計に含めていません（表の「価格未設定」は拠点ごとの件数）。
        <Link href="/admin/costs/prices" className="ml-1 text-blue-700 underline">
          卸価格を登録する
        </Link>
      </p>
    </div>
  );
}
