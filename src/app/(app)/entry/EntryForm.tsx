'use client';

import { useMemo, useState, useTransition } from 'react';
import { MOVEMENT_TYPE_LABELS } from '@/lib/movementLabels';
import { formatQuantity, toBottles } from '@/lib/quantity';
import type { Drink, Location, MovementType, StockLevel } from '@/lib/types';
import { submitEntry } from './actions';
import { DrinkPicker } from './DrinkPicker';

type Line = { key: string; drinkId: string; cases: string; bottles: string };
type Props = { drinks: Drink[]; locations: Location[]; levels: StockLevel[]; defaultLocationId: string };

const TYPES: MovementType[] = ['receive', 'sale', 'transfer', 'adjust'];
const newLine = (): Line => ({ key: crypto.randomUUID(), drinkId: '', cases: '', bottles: '' });
const toInt = (s: string) => (s.trim() === '' ? 0 : Number(s));

export function EntryForm({ drinks, locations, levels, defaultLocationId }: Props) {
  const [type, setType] = useState<MovementType>('receive');
  const [locationId, setLocationId] = useState(defaultLocationId);
  const [destinationId, setDestinationId] = useState(
    locations.find((l) => l.id !== defaultLocationId)?.id ?? '',
  );
  const [lines, setLines] = useState<Line[]>(() => [newLine()]);
  const [note, setNote] = useState('');
  const [batchId, setBatchId] = useState(() => crypto.randomUUID());
  const [warnings, setWarnings] = useState<string[] | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const drinkById = useMemo(() => new Map(drinks.map((d) => [d.id, d])), [drinks]);
  const stockOf = (loc: string, drink: string) =>
    levels.find((l) => l.locationId === loc && l.drinkId === drink)?.quantity ?? 0;

  const resetFeedback = () => {
    setWarnings(null);
    setMessage(null);
  };
  const updateLine = (key: string, patch: Partial<Line>) => {
    resetFeedback();
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  function buildItems(): { items: unknown[] } | { error: string } {
    const filled = lines.filter((l) => l.drinkId);
    if (filled.length === 0) return { error: 'ドリンクを選んでください' };
    if (type === 'transfer' && locationId === destinationId) return { error: '移動元と移動先が同じです' };
    const items: unknown[] = [];
    for (const line of filled) {
      const drink = drinkById.get(line.drinkId);
      if (!drink) return { error: 'ドリンクを選び直してください' };
      const cases = toInt(line.cases);
      const bottles = toInt(line.bottles);
      if (!Number.isInteger(cases) || !Number.isInteger(bottles) || cases < 0 || bottles < 0) {
        return { error: `${drink.name}の数量が正しくありません` };
      }
      const total = toBottles(cases, bottles, drink.unitsPerCase);
      if (type === 'adjust') {
        items.push({ type, drinkId: drink.id, toLocationId: locationId, countedQuantity: total });
        continue;
      }
      if (total < 1) return { error: `${drink.name}の数量を入力してください` };
      if (type === 'receive') items.push({ type, drinkId: drink.id, toLocationId: locationId, quantity: total });
      if (type === 'sale') items.push({ type, drinkId: drink.id, fromLocationId: locationId, quantity: total });
      if (type === 'transfer') {
        items.push({ type, drinkId: drink.id, fromLocationId: locationId, toLocationId: destinationId, quantity: total });
      }
    }
    return { items };
  }

  function submit(confirmNegative: boolean) {
    const built = buildItems();
    if ('error' in built) {
      setMessage({ kind: 'error', text: built.error });
      return;
    }
    startTransition(async () => {
      try {
        const res = await submitEntry({ batchId, confirmNegative, note: note || undefined, items: built.items });
        if (res.status === 'confirm') {
          setWarnings(res.warnings);
          return;
        }
        setWarnings(null);
        if (res.status === 'error') {
          setMessage({ kind: 'error', text: res.message });
          return;
        }
        setMessage({ kind: 'ok', text: `${res.count}件登録しました` });
        setLines([newLine()]);
        setNote('');
        setBatchId(crypto.randomUUID());
      } catch {
        setMessage({ kind: 'error', text: '通信エラーです。もう一度「登録する」を押してください（二重に登録はされません）' });
      }
    });
  }

  const locationLabel = type === 'transfer' ? '移動元' : '拠点';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-1 rounded bg-gray-200 p-1">
        {TYPES.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={type === t}
            onClick={() => {
              resetFeedback();
              setType(t);
            }}
            className={`rounded py-2 text-sm ${type === t ? 'bg-white font-bold shadow' : 'text-gray-600'}`}
          >
            {MOVEMENT_TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="flex-1">
          <span className="mb-1 block text-sm">{locationLabel}</span>
          <select
            value={locationId}
            onChange={(e) => {
              resetFeedback();
              setLocationId(e.target.value);
            }}
            className="w-full rounded border bg-white px-3 py-2"
          >
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        {type === 'transfer' && (
          <label className="flex-1">
            <span className="mb-1 block text-sm">移動先</span>
            <select
              value={destinationId}
              onChange={(e) => {
                resetFeedback();
                setDestinationId(e.target.value);
              }}
              className="w-full rounded border bg-white px-3 py-2"
            >
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {type === 'adjust' && <p className="text-sm text-gray-600">実際に数えた数を入力してください。</p>}

      <ul className="space-y-3">
        {lines.map((line, i) => {
          const drink = drinkById.get(line.drinkId);
          const book = drink ? stockOf(locationId, drink.id) : 0;
          const counted = drink ? toBottles(toInt(line.cases), toInt(line.bottles), drink.unitsPerCase) : 0;
          return (
            <li key={line.key} className="space-y-2 rounded border bg-white p-3">
              <DrinkPicker
                drinks={drinks}
                value={line.drinkId}
                onChange={(id) => updateLine(line.key, { drinkId: id })}
                label={`ドリンク${i + 1}`}
              />
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={line.cases}
                  onChange={(e) => updateLine(line.key, { cases: e.target.value })}
                  aria-label={`ケース${i + 1}`}
                  className="w-20 rounded border px-2 py-2 text-right"
                />
                <span>ケース</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={line.bottles}
                  onChange={(e) => updateLine(line.key, { bottles: e.target.value })}
                  aria-label={`本${i + 1}`}
                  className="w-20 rounded border px-2 py-2 text-right"
                />
                <span>本</span>
                {lines.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                    className="ml-auto text-sm text-red-600"
                  >
                    削除
                  </button>
                )}
              </div>
              {drink && (
                <p className="text-xs text-gray-600">
                  現在の帳簿: {formatQuantity(book, drink.unitsPerCase)}
                  {type === 'adjust' && ` → 差 ${counted - book >= 0 ? '+' : '−'}${Math.abs(counted - book)}本`}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={() => setLines((prev) => [...prev, newLine()])}
        className="w-full rounded border border-dashed py-2 text-sm text-gray-600"
      >
        ＋ ドリンクを追加
      </button>

      <label className="block">
        <span className="mb-1 block text-sm">メモ（任意）</span>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={200}
          className="w-full rounded border px-3 py-2"
        />
      </label>

      {warnings && (
        <div className="space-y-2 rounded border border-yellow-400 bg-yellow-50 p-3 text-sm">
          <p className="font-bold">在庫がマイナスになります。登録してよいですか？</p>
          <ul className="list-disc pl-5">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          <button
            type="button"
            disabled={pending}
            onClick={() => submit(true)}
            className="rounded bg-yellow-500 px-4 py-2 font-bold text-white disabled:opacity-50"
          >
            マイナスでも登録する
          </button>
        </div>
      )}
      {message && (
        <p className={`text-sm ${message.kind === 'ok' ? 'text-green-700' : 'text-red-600'}`}>{message.text}</p>
      )}

      <button
        type="button"
        disabled={pending}
        onClick={() => submit(false)}
        className="w-full rounded bg-blue-600 py-3 font-bold text-white disabled:opacity-50"
      >
        登録する
      </button>
    </div>
  );
}
