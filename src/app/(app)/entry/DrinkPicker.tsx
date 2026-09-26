'use client';

import { useState } from 'react';
import { matchesSearch } from '@/lib/search';
import type { Drink } from '@/lib/types';

type Props = { drinks: Drink[]; value: string; onChange: (id: string) => void; label: string };

export function DrinkPicker({ drinks, value, onChange, label }: Props) {
  const [query, setQuery] = useState('');
  const options = drinks.filter((d) => d.id === value || matchesSearch(d.name, query));
  return (
    <div className="flex gap-2">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="絞り込み"
        aria-label={`${label}の絞り込み`}
        className="w-28 rounded border px-2 py-2 text-sm"
      />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="min-w-0 flex-1 rounded border bg-white px-2 py-2"
      >
        <option value="">ドリンクを選択</option>
        {options.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
    </div>
  );
}
