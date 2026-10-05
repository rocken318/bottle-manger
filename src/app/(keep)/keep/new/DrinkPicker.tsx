'use client';

import { useState } from 'react';
import { CATEGORY_ALL, categoryOptions, inCategory } from '@/lib/categoryFilter';
import { matchesSearch } from '@/lib/search';
import type { Category, Drink } from '@/lib/types';

/** 候補の出しすぎを避ける。絞り込めば出てくる。 */
const MAX_SHOWN = 30;

export function DrinkPicker({
  drinks,
  categories,
  value,
  onChange,
}: {
  drinks: Drink[];
  categories: Category[];
  value: string;
  onChange: (drinkId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState(CATEGORY_ALL);

  const matched = drinks.filter((d) => matchesSearch(d.name, query));
  const options = categoryOptions(matched, categories, categoryId);
  const shown = matched.filter((d) => inCategory(d, categoryId));
  const selected = drinks.find((d) => d.id === value);

  return (
    <div className="space-y-2">
      <span className="block text-sm">お酒</span>
      <div className="flex gap-2">
        <select
          aria-label="種類"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="rounded border bg-white px-2 py-2 text-sm"
        >
          {options.map((o) => (
            <option key={o.key} value={o.key}>
              {o.key === CATEGORY_ALL ? '種類：すべて' : o.label}（{o.count}）
            </option>
          ))}
        </select>
        <input
          type="search"
          aria-label="お酒の名前で検索"
          placeholder="お酒の名前で検索"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-w-0 flex-1 rounded border px-3 py-2"
        />
      </div>
      {selected && (
        <p className="text-sm">
          選択中：<strong>{selected.name}</strong>
        </p>
      )}
      {shown.length === 0 ? (
        <p className="text-sm text-gray-600">該当するお酒がありません。</p>
      ) : (
        <ul className="max-h-64 overflow-y-auto rounded border bg-white">
          {shown.slice(0, MAX_SHOWN).map((d) => (
            <li key={d.id}>
              <button
                type="button"
                aria-pressed={d.id === value}
                onClick={() => onChange(d.id)}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${d.id === value ? 'bg-blue-50 font-bold' : ''}`}
              >
                <span>{d.name}</span>
                <span className="text-xs text-gray-500">{d.categoryName ?? '未分類'}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {shown.length > MAX_SHOWN && (
        <p className="text-xs text-gray-500">ほかに {shown.length - MAX_SHOWN} 件あります。名前や種類で絞り込んでください。</p>
      )}
    </div>
  );
}
