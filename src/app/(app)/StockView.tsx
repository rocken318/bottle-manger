'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { CATEGORY_ALL, categoryOptions, inCategory } from '@/lib/categoryFilter';
import { formatQuantity } from '@/lib/quantity';
import { matchesSearch } from '@/lib/search';
import type { Category, Drink, Location, StockLevel } from '@/lib/types';

const ONLY_IN_STOCK_KEY = 'stock:onlyInStock';
const ALL = 'all';

type Props = { locations: Location[]; drinks: Drink[]; levels: StockLevel[]; categories: Category[] };

function DrinkLinks({ drink, href }: { drink: Drink; href: string }) {
  return (
    <span className="inline-flex items-baseline gap-2">
      <Link href={href} className="text-blue-700 underline">
        {drink.name}
      </Link>
      <Link
        href={`/history?drink=${drink.id}`}
        aria-label={`${drink.name}の履歴`}
        className="text-xs text-gray-500 underline"
      >
        履歴
      </Link>
    </span>
  );
}

export function StockView({ locations, drinks, levels, categories }: Props) {
  // Default to the all-locations table so every store's current stock is visible at a glance.
  const [locationId, setLocationId] = useState(ALL);
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState(CATEGORY_ALL);
  // Off by default; remembered per device. Read after mount so the server-rendered markup
  // (always "off") matches the first client render and avoids a hydration mismatch.
  const [onlyInStock, setOnlyInStock] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(ONLY_IN_STOCK_KEY) === 'true') setOnlyInStock(true);
    } catch {
      // Ignore (private browsing, disabled storage, etc.) — just keep the default.
    }
  }, []);

  const setOnlyInStockPersisted = (next: boolean) => {
    setOnlyInStock(next);
    try {
      localStorage.setItem(ONLY_IN_STOCK_KEY, String(next));
    } catch {
      // Ignore; the choice just won't be remembered on this device.
    }
  };

  const quantities = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of levels) map.set(`${l.locationId}:${l.drinkId}`, l.quantity);
    return map;
  }, [levels]);
  const qty = (loc: string, drink: string) => quantities.get(`${loc}:${drink}`) ?? 0;
  // Negative stock always counts as "has stock" — only an exact 0 is hidden.
  const hasStock = (d: Drink) =>
    locationId === ALL ? locations.some((l) => qty(l.id, d.id) !== 0) : qty(locationId, d.id) !== 0;
  // 種類の選択肢に出す件数は「種類以外の条件を通ったもの」で数える。
  // そうしないと、在庫があるものだけ表示にしているときに数字が実態と合わない。
  const base = drinks.filter((d) => matchesSearch(d.name, query) && (!onlyInStock || hasStock(d)));
  const options = categoryOptions(base, categories, categoryId);
  const visible = base.filter((d) => inCategory(d, categoryId));
  // The drink name opens the entry page for that drink (and the selected location, if any).
  const entryHref = (drinkId: string) =>
    locationId === ALL ? `/entry?drink=${drinkId}` : `/entry?drink=${drinkId}&location=${locationId}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <label className="flex-1">
          <span className="mb-1 block text-xs text-gray-600">表示する拠点</span>
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            className="w-full rounded border bg-white px-3 py-2"
          >
            <option value="all">全拠点</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex-1">
          <span className="mb-1 block text-xs text-gray-600">検索</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ボトル名"
            className="w-full rounded border bg-white px-3 py-2"
          />
        </label>
        <label className="flex-1">
          <span className="mb-1 block text-xs text-gray-600">種類でしぼる</span>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full rounded border bg-white px-3 py-2"
          >
            {options.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}（{o.count}）
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={onlyInStock}
          onChange={(e) => setOnlyInStockPersisted(e.target.checked)}
        />
        在庫があるものだけ表示
      </label>

      {visible.length === 0 ? (
        <p className="text-gray-500">該当するボトルがありません</p>
      ) : locationId === 'all' ? (
        <div className="overflow-x-auto rounded border bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="sticky left-0 bg-gray-100 px-3 py-2 text-left">ボトル</th>
                {locations.map((l) => (
                  <th key={l.id} className="whitespace-nowrap px-3 py-2 text-right">
                    {l.name}
                  </th>
                ))}
                <th className="whitespace-nowrap px-3 py-2 text-right">合計</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((d) => {
                const total = locations.reduce((sum, l) => sum + qty(l.id, d.id), 0);
                return (
                  <tr key={d.id} className="border-t">
                    <td className="sticky left-0 whitespace-nowrap bg-white px-3 py-2">
                      <DrinkLinks drink={d} href={entryHref(d.id)} />
                    </td>
                    {locations.map((l) => {
                      const n = qty(l.id, d.id);
                      return (
                        <td
                          key={l.id}
                          className={`whitespace-nowrap px-3 py-2 text-right ${n < 0 ? 'font-bold text-red-600' : ''}`}
                        >
                          {formatQuantity(n, d.unitsPerCase)}
                        </td>
                      );
                    })}
                    <td
                      className={`whitespace-nowrap px-3 py-2 text-right font-bold ${total < 0 ? 'text-red-600' : ''}`}
                    >
                      {formatQuantity(total, d.unitsPerCase)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <ul className="divide-y rounded border bg-white">
          {visible.map((d) => {
            const n = qty(locationId, d.id);
            return (
              <li key={d.id} className="flex items-center justify-between px-3 py-3">
                <DrinkLinks drink={d} href={entryHref(d.id)} />
                <span className={n < 0 ? 'font-bold text-red-600' : ''}>{formatQuantity(n, d.unitsPerCase)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
