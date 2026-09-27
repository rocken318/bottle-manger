import { requireAdmin } from '@/lib/auth/current';
import { formatUnitPrice, formatYen, lineAmountYen } from '@/lib/costs/money';
import { parseCostFilter } from '@/lib/costs/period';
import { formatLossRate, isVarianceFlagged, rankVarianceByDrink } from '@/lib/costs/report';
import { formatDateTime } from '@/lib/dates';
import { getDb } from '@/lib/db/client';
import { listVarianceDetails, loadMonthlyReport } from '@/lib/repo/costs';
import { listLocations } from '@/lib/repo/locations';
import { getCostSettings } from '@/lib/repo/settings';
import { CostFilterForm, CostsNav, CsvLinks, MissingPriceWarning, VoidNote } from '../CostsShared';

const signed = (n: number) => (n > 0 ? `+${formatYen(n)}` : formatYen(n));
const numClass = (n: number) => `whitespace-nowrap px-2 py-2 text-right tabular-nums ${n < 0 ? 'text-red-700' : ''}`;

export default async function CostsVariancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const { filter, notice } = parseCostFilter(await searchParams);
  const db = getDb();
  const [locations, settings, details] = await Promise.all([
    listLocations(db, { includeInactive: true }),
    getCostSettings(db),
    listVarianceDetails(db, filter),
  ]);
  const report = await loadMonthlyReport(db, filter, settings.taxRate);
  const thresholds = { qty: settings.varianceQtyThreshold, amount: settings.varianceAmountThreshold };

  const rows = details.map((d) => {
    const amountYen = d.unitCents === null ? null : lineAmountYen(d.diffQty, d.unitCents);
    return { ...d, amountYen, flagged: isVarianceFlagged(d.diffQty, amountYen, thresholds) };
  });
  const ranking = rankVarianceByDrink(rows).filter((r) => r.diffQty !== 0 || r.amountYen !== 0);
  const missingIds = new Set(rows.filter((r) => r.amountYen === null && r.diffQty !== 0).map((r) => r.drinkId));
  const missingDrinks = [...new Map(rows.filter((r) => missingIds.has(r.drinkId)).map((r) => [r.drinkId, r.drinkName]))].map(
    ([id, name]) => ({ id, name }),
  );

  return (
    <div className="space-y-4">
      <CostsNav current="variance" filter={filter} />
      <CostFilterForm action="/admin/costs/variance" filter={filter} locations={locations} notice={notice} />
      <VoidNote />
      <p className="text-xs text-gray-600">
        差異 = 実数 − 帳簿（マイナスはロス）。差異金額は棚卸日の卸価格で計算します。差異が {settings.varianceQtyThreshold}本以上
        または {formatYen(settings.varianceAmountThreshold)}円以上の行を強調しています。
      </p>
      <MissingPriceWarning drinks={missingDrinks} />
      <CsvLinks filter={filter} />

      <section className="space-y-2">
        <h2 className="font-bold">店舗 × 月のロス</h2>
        <div className="overflow-x-auto rounded border bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-600">
              <tr>
                <th scope="col" className="px-2 py-2 text-left">年月</th>
                <th scope="col" className="px-2 py-2 text-left">拠点</th>
                <th scope="col" className="px-2 py-2 text-right">棚卸差異金額</th>
                <th scope="col" className="px-2 py-2 text-right">売上原価</th>
                <th scope="col" className="px-2 py-2 text-right">ロス率</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {report.rows.map((r) => (
                <tr
                  key={`${r.month}:${r.locationId ?? 'total'}`}
                  className={r.locationId === null ? 'bg-gray-50 font-bold' : ''}
                >
                  <td className="whitespace-nowrap px-2 py-2">{r.month}</td>
                  <th scope="row" className="whitespace-nowrap px-2 py-2 text-left font-normal">
                    {r.locationId === null ? <span className="font-bold">{r.locationName}</span> : r.locationName}
                  </th>
                  <td className={numClass(r.varianceYen)}>{formatYen(r.varianceYen)}</td>
                  <td className={numClass(r.cogsYen)}>{formatYen(r.cogsYen)}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">{formatLossRate(r.lossRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-bold">ボトル別の差異</h2>
        {ranking.length === 0 ? (
          <p className="text-sm text-gray-500">この期間に差異はありません</p>
        ) : (
          <div className="overflow-x-auto rounded border bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-600">
                <tr>
                  <th scope="col" className="px-2 py-2 text-left">ボトル</th>
                  <th scope="col" className="px-2 py-2 text-right">棚卸回数</th>
                  <th scope="col" className="px-2 py-2 text-right">差異本数</th>
                  <th scope="col" className="px-2 py-2 text-right">差異金額</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {ranking.map((r) => (
                  <tr key={r.drinkId}>
                    <th scope="row" className="whitespace-nowrap px-2 py-2 text-left font-normal">
                      {r.drinkName}
                    </th>
                    <td className="px-2 py-2 text-right tabular-nums">{r.count}</td>
                    <td className={numClass(r.diffQty)}>{signed(r.diffQty)}</td>
                    <td className={numClass(r.amountYen)}>
                      {signed(r.amountYen)}
                      {r.missingCount > 0 && (
                        <span className="ml-1 rounded bg-amber-100 px-1 text-xs text-amber-900">価格未設定{r.missingCount}件</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-bold">棚卸の明細</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-gray-500">この期間の棚卸はありません</p>
        ) : (
          <div className="overflow-x-auto rounded border bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-600">
                <tr>
                  <th scope="col" className="px-2 py-2 text-left">日時</th>
                  <th scope="col" className="px-2 py-2 text-left">拠点</th>
                  <th scope="col" className="px-2 py-2 text-left">数えた人</th>
                  <th scope="col" className="px-2 py-2 text-left">ボトル</th>
                  <th scope="col" className="px-2 py-2 text-right">帳簿</th>
                  <th scope="col" className="px-2 py-2 text-right">実数</th>
                  <th scope="col" className="px-2 py-2 text-right">差異本数</th>
                  <th scope="col" className="px-2 py-2 text-right">単価</th>
                  <th scope="col" className="px-2 py-2 text-right">差異金額</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.id} className={r.flagged ? 'bg-red-50' : ''} data-flagged={r.flagged || undefined}>
                    <td className="whitespace-nowrap px-2 py-2">{formatDateTime(r.createdAt)}</td>
                    <td className="whitespace-nowrap px-2 py-2">{r.locationName}</td>
                    <td className="whitespace-nowrap px-2 py-2">{r.staffName}</td>
                    <td className="whitespace-nowrap px-2 py-2">
                      {r.flagged && <span className="mr-1 font-bold text-red-700">要確認</span>}
                      {r.drinkName}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{r.bookQty}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{r.countedQty}</td>
                    <td className={numClass(r.diffQty)}>{signed(r.diffQty)}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">
                      {r.unitCents === null ? '' : formatUnitPrice(r.unitCents)}
                    </td>
                    <td className={numClass(r.amountYen ?? 0)}>
                      {r.amountYen === null ? (
                        r.diffQty === 0 ? (
                          '0'
                        ) : (
                          <span className="rounded bg-amber-100 px-1 text-xs text-amber-900">価格未設定</span>
                        )
                      ) : (
                        signed(r.amountYen)
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="text-xs text-gray-500">金額の単位は円です。</p>
    </div>
  );
}
