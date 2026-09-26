import { toBottles } from './quantity';
import type { Drink, MovementType } from './types';
import type { MovementItem } from './validation';

/** Raw text typed into the cases / bottles inputs of one drink row. */
export type EntryQuantity = { cases: string; bottles: string };

export type BuildEntryItemsInput = {
  type: MovementType;
  /** Target location (receive / adjust) or source location (sale / transfer). */
  locationId: string;
  /** Destination location, only used for transfers. */
  destinationId: string;
  drinks: Drink[];
  /** Keyed by drink id. */
  quantities: Record<string, EntryQuantity | undefined>;
};

export function isFilled(q: EntryQuantity | undefined): boolean {
  return !!q && (q.cases.trim() !== '' || q.bottles.trim() !== '');
}

/** Upper bound for one row, matching the server-side validation. */
export const MAX_BOTTLES = 100000;

/** Parses one input: blank means 0; anything but plain digits (e.g. '1e3', '-1', '1.5') is NaN. */
export function parseCount(text: string): number {
  const s = text.trim();
  if (s === '') return 0;
  return /^\d+$/.test(s) ? Number(s) : Number.NaN;
}

/** Total bottles typed for a row, or NaN when an input is invalid. */
export function rowTotal(q: EntryQuantity | undefined, unitsPerCase: number): number {
  if (!q) return 0;
  return toBottles(parseCount(q.cases), parseCount(q.bottles), unitsPerCase);
}

/**
 * Turns the bulk entry table into movement items. Only rows with something typed in
 * are submitted; the order follows `drinks`.
 */
export function buildEntryItems(input: BuildEntryItemsInput): { items: MovementItem[] } | { error: string } {
  const { type, locationId, destinationId, drinks, quantities } = input;
  if (type === 'transfer') {
    if (!destinationId) return { error: '移動先の拠点がありません' };
    if (locationId === destinationId) return { error: '移動元と移動先が同じです' };
  }
  const items: MovementItem[] = [];
  for (const drink of drinks) {
    const q = quantities[drink.id];
    if (!q || !isFilled(q)) continue;
    const total = rowTotal(q, drink.unitsPerCase);
    if (Number.isNaN(total)) return { error: `${drink.name}の数量が正しくありません` };
    if (total > MAX_BOTTLES) return { error: `${drink.name}の本数が大きすぎます` };
    const base = { drinkId: drink.id, unitsPerCase: drink.unitsPerCase };
    if (type === 'adjust') {
      items.push({ type, ...base, toLocationId: locationId, countedQuantity: total });
      continue;
    }
    if (total < 1) return { error: `${drink.name}の数量を入力してください` };
    if (type === 'receive') items.push({ type, ...base, toLocationId: locationId, quantity: total });
    else if (type === 'sale') items.push({ type, ...base, fromLocationId: locationId, quantity: total });
    else items.push({ type, ...base, fromLocationId: locationId, toLocationId: destinationId, quantity: total });
  }
  if (items.length === 0) return { error: 'ボトルの数量を入力してください' };
  return { items };
}

/**
 * Drink ids whose units per case differ from what the client used (the drink was edited
 * after the entry page was loaded). Unknown drinks are left to the database checks.
 */
export function findUnitsPerCaseMismatches(
  items: { drinkId: string; unitsPerCase: number }[],
  drinks: Pick<Drink, 'id' | 'unitsPerCase'>[],
): string[] {
  const current = new Map(drinks.map((d) => [d.id, d.unitsPerCase]));
  return items
    .filter((item) => current.has(item.drinkId) && current.get(item.drinkId) !== item.unitsPerCase)
    .map((item) => item.drinkId);
}
