import { requireAdmin } from '@/lib/auth/current';
import { formatUnitPrice } from '@/lib/costs/money';
import { jstToday } from '@/lib/costs/period';
import { getDb } from '@/lib/db/client';
import { listDrinks } from '@/lib/repo/drinks';
import { listPriceHistory } from '@/lib/repo/prices';
import { CostsNav } from '../CostsShared';
import { PriceCreateForm, PriceDeleteButton } from './PriceForms';
import { PageHelp } from '../../../PageHelp';

export default async function CostsPricesPage() {
  await requireAdmin();
  const db = getDb();
  const [drinks, history] = await Promise.all([listDrinks(db, { includeInactive: true }), listPriceHistory(db)]);
  const today = jstToday();

  const byDrink = new Map<string, typeof history>();
  for (const p of history) byDrink.set(p.drinkId, [...(byDrink.get(p.drinkId) ?? []), p]);
  // Active drinks, plus retired ones that still have a price history.
  const shown = drinks.filter((d) => d.isActive || byDrink.has(d.id));

  return (
    <div className="space-y-4">
      <CostsNav current="prices" />
      <PageHelp>
        <ul>
          <li>ボトルごとの卸価格（仕入れ値・税抜）を登録します。原価の計算に使います。</li>
          <li>ボトル・適用開始日・価格を入れて「登録」を押します。1本あたりでも、1ケースあたりでも入力できます。</li>
          <li>値上げ・値下げのときは、新しい適用開始日で登録します。その日から新しい価格で計算され、前の価格は履歴に残ります。</li>
          <li>先の日付で登録すると「予定」と表示され、その日から使われます。</li>
          <li>まちがえたときは、同じボトル・同じ適用開始日で登録し直すと上書きされます。いらない行は「削除」で消せます。</li>
          <li>「価格未設定」のボトルは金額の集計に入らないので、早めに登録してください。</li>
        </ul>
      </PageHelp>
      <PriceCreateForm
        drinks={drinks.filter((d) => d.isActive).map((d) => ({ id: d.id, name: d.name, unitsPerCase: d.unitsPerCase }))}
        today={today}
      />
      <p className="text-xs text-gray-600">
        卸価格は1本あたり・税抜です。ある日の金額には、その日までに適用が始まった最新の価格を使います。
      </p>
      <ul className="divide-y rounded border bg-white text-sm">
        {shown.map((d) => {
          const prices = byDrink.get(d.id) ?? [];
          const current = prices.find((p) => p.effectiveFrom <= today);
          return (
            <li key={d.id} className="space-y-1 px-3 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-bold">
                  {d.name}
                  {!d.isActive && <span className="ml-1 text-xs font-normal text-gray-500">（廃止）</span>}
                </span>
                {current ? (
                  <span className="tabular-nums">
                    現在 1本 {formatUnitPrice(current.unitCents)}円
                    <span className="ml-1 text-xs text-gray-500">（ケース {formatUnitPrice(current.unitCents * d.unitsPerCase)}円）</span>
                  </span>
                ) : (
                  <span className="rounded bg-amber-100 px-1 text-amber-900">価格未設定</span>
                )}
              </div>
              {prices.length > 0 && (
                <table className="w-full text-xs">
                  <thead className="text-gray-500">
                    <tr>
                      <th scope="col" className="py-1 text-left font-normal">適用開始日</th>
                      <th scope="col" className="py-1 text-right font-normal">1本（円）</th>
                      <th scope="col" className="py-1 text-left font-normal pl-3">登録した人</th>
                      <th scope="col" className="py-1" />
                    </tr>
                  </thead>
                  <tbody>
                    {prices.map((p) => (
                      <tr key={p.id} className={p === current ? 'font-bold' : ''}>
                        <td className="py-1">
                          {p.effectiveFrom}
                          {p.effectiveFrom > today && <span className="ml-1 font-normal text-blue-700">予定</span>}
                        </td>
                        <td className="py-1 text-right tabular-nums">{formatUnitPrice(p.unitCents)}</td>
                        <td className="py-1 pl-3">{p.createdByName ?? ''}</td>
                        <td className="py-1 text-right">
                          <PriceDeleteButton id={p.id} label={`${d.name} ${p.effectiveFrom} の卸価格`} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
