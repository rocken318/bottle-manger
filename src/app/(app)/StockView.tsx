'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { formatQuantity } from '@/lib/quantity';
import { matchesSearch } from '@/lib/search';
import type { Drink, Location, StockLevel } from '@/lib/types';

type Props = { locations: Location[]; drinks: Drink[]; levels: StockLevel[]; defaultLocationId: string };

export function StockView({ locations, drinks, levels, defaultLocationId }: Props) {
  const [locationId, setLocationId] = useState(defaultLocationId);
  const [query, setQuery] = useState('');

  const quantities = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of levels) map.set(`${l.locationId}:${l.drinkId}`, l.quantity);
    return map;
  }, [levels]);
  const qty = (loc: string, drink: string) => quantities.get(`${loc}:${drink}`) ?? 0;
  const visible = drinks.filter((d) => matchesSearch(d.name, query));

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
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
            <option value="all">全拠点</option>
          </select>
        </label>
        <label className="flex-1">
          <span className="mb-1 block text-xs text-gray-600">検索</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ドリンク名"
            className="w-full rounded border bg-white px-3 py-2"
          />
        </label>
      </div>

      {visible.length === 0 && <p className="text-gray-500">該当するドリンクがありません</p>}

      {locationId === 'all' ? (
        <div className="overflow-x-auto rounded border bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="sticky left-0 bg-gray-100 px-3 py-2 text-left">ドリンク</th>
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
                      <Link href={`/history?drink=${d.id}`} className="text-blue-700 underline">
                        {d.name}
                      </Link>
                    </td>
                    {locations.map((l) => {
                      const n = qty(l.id, d.id);
                      return (
                        <td key={l.id} className={`whitespace-nowrap px-3 py-2 text-right ${n < 0 ? 'text-red-600' : ''}`}>
                          {formatQuantity(n, d.unitsPerCase)}
                        </td>
                      );
                    })}
                    <td className="whitespace-nowrap px-3 py-2 text-right font-bold">
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
                <Link href={`/history?drink=${d.id}`} className="text-blue-700 underline">
                  {d.name}
                </Link>
                <span className={n < 0 ? 'font-bold text-red-600' : ''}>{formatQuantity(n, d.unitsPerCase)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
