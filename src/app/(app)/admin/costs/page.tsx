import { requireAdmin } from '@/lib/auth/current';
import { formatYen } from '@/lib/costs/money';
import { parseCostFilter } from '@/lib/costs/period';
import { formatLossRate } from '@/lib/costs/report';
import { getDb } from '@/lib/db/client';
import { loadMonthlyReport } from '@/lib/repo/costs';
import { listLocations } from '@/lib/repo/locations';
import { getCostSettings } from '@/lib/repo/settings';
import { PageHelp } from '../../PageHelp';
import { CostFilterForm, CostsNav, CsvLinks, MissingPriceWarning, VoidNote } from './CostsShared';

const COLUMNS = [
  '年月',
  '拠点',
  '月初在庫金額',
  '仕入額（税抜）',
  '仕入消費税',
  '仕入額（税込）',
  '移動入',
  '移動出',
  '棚卸差異金額',
  '廃棄額',
  '月末在庫金額',
  '売上原価',
  'ロス率',
  '価格未設定',
];

export default async function CostsMonthlyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const { filter, notice } = parseCostFilter(await searchParams);
  const db = getDb();
  const [locations, settings] = await Promise.all([listLocations(db, { includeInactive: true }), getCostSettings(db)]);
  const report = await loadMonthlyReport(db, filter, settings.taxRate);

  return (
    <div className="space-y-4">
      <CostsNav current="monthly" filter={filter} />
      <PageHelp>
        <p className="font-bold">見かた</p>
        <ul>
          <li>開始月・終了月・拠点を選んで「表示」を押すと、拠点ごと・月ごとの金額が出ます（最大24か月）。</li>
          <li>各月の最後の行「全店合計」は、全拠点を合わせた数字です。拠点間の移動は合計では差し引きゼロになります。</li>
          <li>売上原価は「その月に使ったボトルの仕入れ値の合計」です（月初の在庫＋仕入れ−月末の在庫）。</li>
          <li>ロス率は、売上原価のうち原因がわからずに減った分（棚卸差異）の割合です。</li>
          <li>在庫の金額は、その日に有効な卸価格で計算します。</li>
          <li>「破損・廃棄」で入力した分は「廃棄額」の列に別に出ます。売上原価には入りますが、ロス率には入りません。</li>
        </ul>
        <p className="font-bold">注意すること</p>
        <ul>
          <li>「価格未設定」の警告が出たら、「卸価格」タブでそのボトルの価格を登録してください。登録するまで、そのボトルの金額は集計に入りません。</li>
          <li>過去の月の記録を後から取り消すと、その月の数字も変わります。</li>
          <li>
            「CSV出力」から、月次集計・仕入明細・棚卸差異明細・月末在庫明細の4種類をダウンロードできます。今選んでいる期間と拠点で出力されます。
          </li>
        </ul>
      </PageHelp>
      <CostFilterForm action="/admin/costs" filter={filter} locations={locations} notice={notice} />
      <VoidNote />
      <p className="text-xs text-gray-600">
        売上原価 = 月初在庫金額 ＋ 仕入額 ＋ 移動入 − 移動出 − 月末在庫金額。廃棄額（破損・廃棄）は売上原価に含まれます。ロス率 = −棚卸差異金額 ÷ 売上原価（原因不明の差異だけ。売上原価が0以下なら空欄）。在庫は各時点で有効な卸価格で評価します。消費税率 {settings.taxRate}%。
      </p>
      <MissingPriceWarning drinks={report.missingDrinks} />
      <CsvLinks filter={filter} />

      <div className="overflow-x-auto rounded border bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-600">
            <tr>
              {COLUMNS.map((c) => (
                <th key={c} scope="col" className="whitespace-nowrap px-2 py-2 text-right first:text-left [&:nth-child(2)]:text-left">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {report.rows.map((r) => {
              const isTotal = r.locationId === null;
              return (
                <tr key={`${r.month}:${r.locationId ?? 'total'}`} className={isTotal ? 'bg-gray-50 font-bold' : ''}>
                  <td className="whitespace-nowrap px-2 py-2">{r.month}</td>
                  <th scope="row" className="whitespace-nowrap px-2 py-2 text-left font-normal">
                    {isTotal ? <span className="font-bold">{r.locationName}</span> : r.locationName}
                  </th>
                  {[
                    r.openingYen,
                    r.purchaseYen,
                    r.purchaseTaxYen,
                    r.purchaseInclYen,
                    r.transferInYen,
                    r.transferOutYen,
                    r.varianceYen,
                    r.disposeYen,
                    r.closingYen,
                    r.cogsYen,
                  ].map((v, i) => (
                    <td key={i} className={`whitespace-nowrap px-2 py-2 text-right tabular-nums ${v < 0 ? 'text-red-700' : ''}`}>
                      {formatYen(v)}
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">{formatLossRate(r.lossRate)}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-right">
                    {r.missingCount > 0 ? (
                      <span className="rounded bg-amber-100 px-1 text-amber-900">{r.missingCount}件</span>
                    ) : (
                      ''
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-500">金額の単位は円です。</p>
    </div>
  );
}
