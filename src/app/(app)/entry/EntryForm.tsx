'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { buildEntryItems, isFilled, rowTotal, type EntryQuantity } from '@/lib/entryItems';
import { MOVEMENT_TYPE_LABELS } from '@/lib/movementLabels';
import { formatQuantity } from '@/lib/quantity';
import { matchesSearch } from '@/lib/search';
import type { Drink, Location, MovementType, StockLevel } from '@/lib/types';
import { submitEntry } from './actions';

type Props = {
  drinks: Drink[];
  locations: Location[];
  levels: StockLevel[];
  defaultLocationId: string;
  initialQuery?: string;
};

const TYPES: MovementType[] = ['receive', 'sale', 'transfer', 'adjust'];
const EMPTY: EntryQuantity = { cases: '', bottles: '' };

export function EntryForm({ drinks, locations, levels, defaultLocationId, initialQuery = '' }: Props) {
  const [type, setType] = useState<MovementType>('receive');
  const [locationId, setLocationId] = useState(defaultLocationId);
  const [destinationId, setDestinationId] = useState(
    locations.find((l) => l.id !== defaultLocationId)?.id ?? '',
  );
  const [query, setQuery] = useState(initialQuery);
  // Keyed by drink id so values typed into rows survive filtering.
  const [quantities, setQuantities] = useState<Record<string, EntryQuantity>>({});
  const [note, setNote] = useState('');
  const [batchId, setBatchId] = useState(() => crypto.randomUUID());
  const [warnings, setWarnings] = useState<string[] | null>(null);
  // Names of filled rows hidden by the search filter, shown for confirmation before submitting.
  const [hiddenConfirm, setHiddenConfirm] = useState<string[] | null>(null);
  // Tab the user wants to switch to while rows are filled (asks before clearing them).
  const [pendingType, setPendingType] = useState<MovementType | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const stock = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of levels) map.set(`${l.locationId}:${l.drinkId}`, l.quantity);
    return map;
  }, [levels]);
  const stockOf = (loc: string, drink: string) => stock.get(`${loc}:${drink}`) ?? 0;

  const transferUnavailable = type === 'transfer' && locations.length < 2;
  const visible = useMemo(() => drinks.filter((d) => matchesSearch(d.name, query)), [drinks, query]);
  const filled = useMemo(() => drinks.filter((d) => isFilled(quantities[d.id])), [drinks, quantities]);
  const hiddenFilled = useMemo(() => {
    const shown = new Set(visible.map((d) => d.id));
    return filled.filter((d) => !shown.has(d.id));
  }, [visible, filled]);

  // If the locations list changes (e.g. after a revalidate deactivates the one currently
  // selected), fall back to a location that still exists instead of holding a stale id.
  useEffect(() => {
    if (locationId && !locations.some((l) => l.id === locationId)) {
      setLocationId(locations[0]?.id ?? '');
    }
  }, [locations, locationId]);
  useEffect(() => {
    const stillValid = destinationId !== '' && locations.some((l) => l.id === destinationId);
    if (!stillValid) {
      setDestinationId(locations.find((l) => l.id !== locationId)?.id ?? '');
    }
  }, [locations, destinationId, locationId]);

  const resetFeedback = () => {
    setWarnings(null);
    setHiddenConfirm(null);
    setMessage(null);
  };
  const changeQuery = (next: string) => {
    setQuery(next);
    // What is hidden changes with the filter, so any pending confirmation is stale.
    setWarnings(null);
    setHiddenConfirm(null);
  };
  const switchType = (next: MovementType) => {
    resetFeedback();
    setPendingType(null);
    if (next !== type) setQuantities({});
    setType(next);
  };
  const requestType = (next: MovementType) => {
    if (next === type) return;
    if (filled.length > 0) {
      setPendingType(next);
      return;
    }
    switchType(next);
  };
  const updateQuantity = (drinkId: string, patch: Partial<EntryQuantity>) => {
    resetFeedback();
    setQuantities((prev) => ({ ...prev, [drinkId]: { ...(prev[drinkId] ?? EMPTY), ...patch } }));
  };

  function submit(confirmNegative: boolean, confirmHidden: boolean) {
    if (transferUnavailable) {
      setMessage({ kind: 'error', text: '移動先の拠点がありません' });
      return;
    }
    const built = buildEntryItems({ type, locationId, destinationId, drinks, quantities });
    if ('error' in built) {
      setMessage({ kind: 'error', text: built.error });
      return;
    }
    if (!confirmHidden && hiddenFilled.length > 0) {
      setMessage(null);
      setHiddenConfirm(hiddenFilled.map((d) => d.name));
      return;
    }
    setHiddenConfirm(null);
    const typeLabel = MOVEMENT_TYPE_LABELS[type];
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
        if (res.alreadySaved) {
          // Same batch was already stored (e.g. a retried submit). Rotate the batch id so a
          // fresh submit of edited rows isn't silently dropped, but keep the rows as-is.
          setMessage({
            kind: 'ok',
            text: '前回の送信はすでに登録されていました。内容を変えた場合は、もう一度「登録する」を押してください',
          });
          setBatchId(crypto.randomUUID());
          return;
        }
        setMessage({ kind: 'ok', text: `${typeLabel} ${res.count}件登録しました` });
        setQuantities({});
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
            onClick={() => requestType(t)}
            className={`rounded py-2 text-sm ${type === t ? 'bg-white font-bold shadow' : 'text-gray-600'}`}
          >
            {MOVEMENT_TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      {pendingType && (
        <div className="space-y-2 rounded border border-yellow-400 bg-yellow-50 p-3 text-sm">
          <p className="font-bold">
            入力中の{filled.length}件を消して「{MOVEMENT_TYPE_LABELS[pendingType]}」に切り替えますか？
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => switchType(pendingType)}
              className="rounded bg-yellow-500 px-4 py-2 font-bold text-white"
            >
              消して切り替える
            </button>
            <button type="button" onClick={() => setPendingType(null)} className="rounded border bg-white px-4 py-2">
              やめる
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <label className="flex-1">
          <span className="mb-1 block text-sm">{locationLabel}</span>
          <select
            value={locationId}
            onChange={(e) => {
              resetFeedback();
              const next = e.target.value;
              setLocationId(next);
              if (next === destinationId) {
                setDestinationId(locations.find((l) => l.id !== next)?.id ?? '');
              }
            }}
            aria-label={locationLabel}
            className="w-full rounded border bg-white px-3 py-2"
          >
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        {type === 'transfer' && !transferUnavailable && (
          <label className="flex-1">
            <span className="mb-1 block text-sm">移動先</span>
            <select
              value={destinationId}
              onChange={(e) => {
                resetFeedback();
                setDestinationId(e.target.value);
              }}
              aria-label="移動先"
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

      {transferUnavailable ? (
        <p className="rounded border border-yellow-400 bg-yellow-50 p-3 text-sm">移動先の拠点がありません</p>
      ) : (
        <>
          {type === 'adjust' && (
            <p className="text-sm text-gray-600">実際に数えた数を入力してください（入力したドリンクだけ登録されます）。</p>
          )}

          <div className="space-y-1">
            <input
              type="search"
              value={query}
              onChange={(e) => changeQuery(e.target.value)}
              placeholder="ドリンク名で絞り込み"
              aria-label="絞り込み"
              className="w-full rounded border bg-white px-3 py-2"
            />
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
              <span>
                入力中 {filled.length}件
                {hiddenFilled.length > 0 && `（うち ${hiddenFilled.length}件は絞り込みで非表示）`}
              </span>
              {hiddenFilled.length > 0 && (
                <button type="button" onClick={() => changeQuery('')} className="text-blue-700 underline">
                  入力済みを表示
                </button>
              )}
            </div>
          </div>

          {visible.length === 0 ? (
            <p className="text-sm text-gray-500">該当するドリンクがありません</p>
          ) : (
            <div className="overflow-x-auto rounded border bg-white">
              <table className="w-full text-sm">
                <thead className="bg-gray-100 text-xs">
                  <tr>
                    <th className="px-2 py-2 text-left">ドリンク</th>
                    <th className="w-16 px-1 py-2 text-center">ケース</th>
                    <th className="w-16 px-1 py-2 text-center">本</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((drink) => {
                    const q = quantities[drink.id] ?? EMPTY;
                    const rowFilled = isFilled(q);
                    const book = stockOf(locationId, drink.id);
                    const counted = rowTotal(q, drink.unitsPerCase);
                    const diff = counted - book;
                    return (
                      <tr key={drink.id} className={`border-t ${rowFilled ? 'bg-blue-50' : ''}`}>
                        <td className="px-2 py-2">
                          <span className="block break-all">{drink.name}</span>
                          <span className="block text-xs text-gray-600">
                            帳簿 {formatQuantity(book, drink.unitsPerCase)}
                            {type === 'adjust' &&
                              rowFilled &&
                              !Number.isNaN(counted) &&
                              ` → 差 ${diff >= 0 ? '+' : '−'}${Math.abs(diff)}本`}
                          </span>
                        </td>
                        <td className="px-1 py-2">
                          <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            value={q.cases}
                            onChange={(e) => updateQuantity(drink.id, { cases: e.target.value })}
                            aria-label={`${drink.name}のケース`}
                            className="w-16 rounded border px-2 py-2 text-right"
                          />
                        </td>
                        <td className="px-1 py-2">
                          <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            value={q.bottles}
                            onChange={(e) => updateQuantity(drink.id, { bottles: e.target.value })}
                            aria-label={`${drink.name}の本`}
                            className="w-16 rounded border px-2 py-2 text-right"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <label className="block">
            <span className="mb-1 block text-sm">メモ（任意）</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
              className="w-full rounded border px-3 py-2"
            />
          </label>
        </>
      )}

      {hiddenConfirm && (
        <div className="space-y-2 rounded border border-yellow-400 bg-yellow-50 p-3 text-sm">
          <p className="font-bold">絞り込みで表示されていない入力があります。これも登録しますか？</p>
          <ul className="list-disc pl-5">
            {hiddenConfirm.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
          <button
            type="button"
            disabled={pending}
            onClick={() => submit(false, true)}
            className="rounded bg-yellow-500 px-4 py-2 font-bold text-white disabled:opacity-50"
          >
            非表示の分も含めて登録する
          </button>
        </div>
      )}
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
            // Hidden rows (if any) were already confirmed before the negative-stock check.
            onClick={() => submit(true, true)}
            className="rounded bg-yellow-500 px-4 py-2 font-bold text-white disabled:opacity-50"
          >
            マイナスでも登録する
          </button>
        </div>
      )}
      {message &&
        (message.kind === 'ok' ? (
          <p aria-live="polite" className="text-sm text-green-700">
            {message.text}
          </p>
        ) : (
          <p role="alert" className="text-sm text-red-600">
            {message.text}
          </p>
        ))}

      <button
        type="button"
        disabled={pending || transferUnavailable}
        onClick={() => submit(false, false)}
        className="w-full rounded bg-blue-600 py-3 font-bold text-white disabled:opacity-50"
      >
        登録する
      </button>
    </div>
  );
}
