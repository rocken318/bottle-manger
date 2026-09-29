'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { buildEntryItems, isFilled, rowTotal, type EntryQuantity } from '@/lib/entryItems';
import { DISPOSE_REASON_LABELS, MOVEMENT_TYPE_LABELS } from '@/lib/movementLabels';
import { formatQuantity } from '@/lib/quantity';
import { matchesSearch } from '@/lib/search';
import { resizeImage } from '@/lib/resizeImage';
import type { DisposeReason, Drink, Location, MovementType, StockLevel } from '@/lib/types';
import { submitEntry } from './actions';

type Props = {
  drinks: Drink[];
  locations: Location[];
  levels: StockLevel[];
  defaultLocationId: string;
  initialQuery?: string;
};

const TYPES: MovementType[] = ['receive', 'sale', 'transfer', 'adjust', 'dispose'];
const MAX_PHOTOS = 3;
const REASONS = Object.keys(DISPOSE_REASON_LABELS) as DisposeReason[];
const EMPTY: EntryQuantity = { cases: '', bottles: '' };

export function EntryForm({ drinks, locations, levels, defaultLocationId, initialQuery = '' }: Props) {
  const [type, setType] = useState<MovementType>('receive');
  const [locationId, setLocationId] = useState(defaultLocationId);
  const [destinationId, setDestinationId] = useState(
    locations.find((l) => l.id !== defaultLocationId)?.id ?? '',
  );
  const [query, setQuery] = useState(initialQuery);
  // 棚卸で数えるときなど、在庫が多いものから順に見たいことがある。
  const [sortByStock, setSortByStock] = useState(false);
  // Keyed by drink id so values typed into rows survive filtering.
  const [quantities, setQuantities] = useState<Record<string, EntryQuantity>>({});
  const [note, setNote] = useState('');
  // 破損・廃棄 only.
  const [reason, setReason] = useState<DisposeReason | ''>('');
  const [photos, setPhotos] = useState<{ file: File; url: string }[]>([]);
  const [batchId, setBatchId] = useState(() => crypto.randomUUID());
  const [warnings, setWarnings] = useState<string[] | null>(null);
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
  const visible = useMemo(() => {
    const filtered = drinks.filter((d) => matchesSearch(d.name, query));
    if (!sortByStock) return filtered;
    // 選んでいる拠点（移動のときは移動元）の在庫が多い順。同数なら元の並びのまま。
    return filtered
      .map((drink, index) => ({ drink, index, stock: stock.get(`${locationId}:${drink.id}`) ?? 0 }))
      .sort((a, b) => b.stock - a.stock || a.index - b.index)
      .map((x) => x.drink);
  }, [drinks, query, sortByStock, stock, locationId]);
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
    setMessage(null);
  };
  const changeQuery = (next: string) => {
    setQuery(next);
    // What would go negative changes with the filter, so any pending warning is stale.
    setWarnings(null);
  };
  const clearPhotos = () => {
    for (const p of photos) URL.revokeObjectURL(p.url);
    setPhotos([]);
  };
  const addPhotos = (files: FileList | null) => {
    if (!files) return;
    const room = MAX_PHOTOS - photos.length;
    const picked = [...files].filter((f) => f.type.startsWith('image/')).slice(0, room);
    if (files.length > room) setMessage({ kind: 'error', text: `写真は${MAX_PHOTOS}枚までです` });
    setPhotos((prev) => [...prev, ...picked.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
  };
  const removePhoto = (url: string) => {
    URL.revokeObjectURL(url);
    setPhotos((prev) => prev.filter((p) => p.url !== url));
  };

  /** Uploads the photos of a saved batch. Returns an error message, or null when all went well. */
  async function uploadPhotos(savedBatchId: string): Promise<string | null> {
    try {
      const form = new FormData();
      for (const p of photos) form.append('photo', await resizeImage(p.file), 'photo.jpg');
      const res = await fetch(`/api/batches/${savedBatchId}/photos`, { method: 'POST', body: form });
      if (res.ok) return null;
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      return body?.error ?? '写真を保存できませんでした';
    } catch {
      return '写真を保存できませんでした（通信エラー）';
    }
  }

  const switchType = (next: MovementType) => {
    resetFeedback();
    setPendingType(null);
    if (next !== type) {
      setQuantities({});
      setReason('');
      clearPhotos();
    }
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

  // 絞り込みで隠れている行も、確認なしでそのまま登録する。
  // 何件隠れているかは操作バーのカウンタに出ている。
  function submit(confirmNegative: boolean) {
    if (transferUnavailable) {
      setMessage({ kind: 'error', text: '移動先の拠点がありません' });
      return;
    }
    const built = buildEntryItems({ type, locationId, destinationId, drinks, quantities, reason });
    if ('error' in built) {
      setMessage({ kind: 'error', text: built.error });
      return;
    }
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
        const photoError = type === 'dispose' && photos.length > 0 ? await uploadPhotos(batchId) : null;
        setMessage(
          photoError
            ? { kind: 'error', text: `${typeLabel} ${res.count}件登録しましたが、${photoError}` }
            : { kind: 'ok', text: `${typeLabel} ${res.count}件登録しました` },
        );
        setQuantities({});
        setNote('');
        setReason('');
        clearPhotos();
        setBatchId(crypto.randomUUID());
      } catch {
        setMessage({ kind: 'error', text: '通信エラーです。もう一度「登録する」を押してください（二重に登録はされません）' });
      }
    });
  }

  const locationLabel = type === 'transfer' ? '移動元' : '拠点';

  // Rendered inside the sticky action bar so it stays visible without scrolling; only shown
  // when the drink list itself is shown (matches the original in-flow placement).
  const counter = !transferUnavailable && (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-xs text-gray-600">
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
  );

  return (
    <>
    <div className="space-y-4 pb-24">
      <div className="grid grid-cols-3 gap-1 rounded bg-gray-200 p-1 sm:grid-cols-5">
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
            <p className="text-sm text-gray-600">実際に数えた数を入力してください（入力したボトルだけ登録されます）。</p>
          )}
          {type === 'dispose' && (
            <label className="block">
              <span className="mb-1 block text-sm">理由（必須）</span>
              <select
                value={reason}
                onChange={(e) => {
                  resetFeedback();
                  setReason(e.target.value as DisposeReason | '');
                }}
                className="w-full rounded border bg-white px-3 py-2"
              >
                <option value="" disabled>
                  選んでください
                </option>
                {REASONS.map((r) => (
                  <option key={r} value={r}>
                    {DISPOSE_REASON_LABELS[r]}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={query}
              onChange={(e) => changeQuery(e.target.value)}
              placeholder="ボトル名で絞り込み"
              aria-label="絞り込み"
              className="min-w-0 flex-1 rounded border bg-white px-3 py-2"
            />
            <button
              type="button"
              onClick={() => setSortByStock((v) => !v)}
              aria-pressed={sortByStock}
              className={`shrink-0 rounded border px-3 py-2 text-sm ${
                sortByStock ? 'border-blue-600 bg-blue-600 text-white' : 'bg-white'
              }`}
            >
              {sortByStock ? '在庫の多い順' : '登録順'}
            </button>
          </div>

          {visible.length === 0 ? (
            <p className="text-sm text-gray-500">該当するボトルがありません</p>
          ) : (
            <div className="overflow-x-auto rounded border bg-white">
              <table className="w-full text-sm">
                <thead className="bg-gray-100 text-xs">
                  <tr>
                    <th className="px-2 py-2 text-left">ボトル</th>
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

          {type === 'dispose' ? (
            <>
              <label className="block">
                <span className="mb-1 block text-sm">状況（何があったか）</span>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={200}
                  rows={3}
                  placeholder="例：棚から落として2本割れた"
                  className="w-full rounded border px-3 py-2"
                />
              </label>
              <div className="space-y-2">
                <span className="block text-sm">写真（任意・{MAX_PHOTOS}枚まで）</span>
                {photos.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {photos.map((p, i) => (
                      <div key={p.url} className="relative">
                        {/* Local preview of a picked file (object URL). */}
                        <img src={p.url} alt={`写真${i + 1}`} className="h-20 w-20 rounded border object-cover" />
                        <button
                          type="button"
                          onClick={() => removePhoto(p.url)}
                          aria-label={`写真${i + 1}を外す`}
                          className="absolute -right-2 -top-2 h-6 w-6 rounded-full bg-gray-700 text-xs text-white"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {photos.length < MAX_PHOTOS && (
                  <label className="inline-block cursor-pointer rounded border bg-white px-4 py-2 text-sm">
                    写真を追加
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => {
                        addPhotos(e.target.files);
                        e.target.value = '';
                      }}
                      className="sr-only"
                    />
                  </label>
                )}
              </div>
            </>
          ) : (
            <label className="block">
              <span className="mb-1 block text-sm">メモ（任意）</span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={200}
                className="w-full rounded border px-3 py-2"
              />
            </label>
          )}
        </>
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
            onClick={() => submit(true)}
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
    </div>

    {/* Sticky action bar: stays visible while scrolling, above the fixed bottom nav (45px tall). */}
    <div className="fixed inset-x-0 bottom-[45px] border-t bg-white">
      <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-2">
        {counter}
        <button
          type="button"
          disabled={pending || transferUnavailable}
          onClick={() => submit(false)}
          className="shrink-0 rounded bg-blue-600 px-6 py-2 font-bold text-white disabled:opacity-50"
        >
          登録する
        </button>
      </div>
    </div>
    </>
  );
}
