'use client';

import Link from 'next/link';
import { useState } from 'react';
import { KEEP_EXPIRY_DAYS, KEEP_WARN_DAYS, countNearExpiry, filterByCustomer } from '@/lib/keep';
import type { KeepBottle } from '@/lib/types';
import { KeepRow } from './KeepRow';

type Tab = 'active' | 'dropped';

export function KeepList({ active, dropped, today }: { active: KeepBottle[]; dropped: KeepBottle[]; today: string }) {
  const [tab, setTab] = useState<Tab>('active');
  const [query, setQuery] = useState('');
  const rows = filterByCustomer(tab === 'active' ? active : dropped, query);
  const nearExpiry = countNearExpiry(active, today);

  return (
    <div className="space-y-4">
      {nearExpiry > 0 && (
        <p role="status" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          期限まで{KEEP_WARN_DAYS}日以内（超過を含む）のボトルが {nearExpiry} 本あります
        </p>
      )}
      <div className="flex gap-2" role="tablist" aria-label="キープの状態">
        {(
          [
            ['active', `キープ中（${active.length}）`],
            ['dropped', `期限切れ（${dropped.length}）`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`rounded px-3 py-2 text-sm ${tab === key ? 'bg-blue-600 font-bold text-white' : 'border bg-white'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <input
        type="search"
        aria-label="お客様名で検索"
        placeholder="お客様名で検索"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full rounded border px-3 py-2"
      />
      {rows.length === 0 ? (
        <p className="text-sm text-gray-600">
          {query ? '該当するボトルがありません。' : tab === 'active' ? 'キープ中のボトルはありません。' : '期限切れのボトルはありません。'}
          {tab === 'active' && !query && (
            <>
              {' '}
              <Link href="/keep/new" className="text-blue-700 underline">
                登録する
              </Link>
            </>
          )}
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((b) => (
            <KeepRow key={b.id} bottle={b} today={today} />
          ))}
        </ul>
      )}
      <p className="text-xs text-gray-500">期限は最終利用日から{KEEP_EXPIRY_DAYS}日です。</p>
    </div>
  );
}
