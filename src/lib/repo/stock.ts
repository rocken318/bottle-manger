import type { MovementInput, StockLevel } from '../types';

export interface NegativeResult {
  locationId: string;
  drinkId: string;
  resulting: number;
}

const key = (locationId: string, drinkId: string) => `${locationId}:${drinkId}`;

/** Simulates the batch on top of the current levels and lists every decreased pair that ends below zero. */
export function findNegativeResults(levels: StockLevel[], items: MovementInput[]): NegativeResult[] {
  const quantities = new Map<string, number>();
  for (const l of levels) quantities.set(key(l.locationId, l.drinkId), l.quantity);
  const decreased = new Map<string, { locationId: string; drinkId: string }>();
  const add = (locationId: string, drinkId: string, delta: number) => {
    const k = key(locationId, drinkId);
    quantities.set(k, (quantities.get(k) ?? 0) + delta);
    if (delta < 0) decreased.set(k, { locationId, drinkId });
  };
  for (const item of items) {
    if (item.type === 'adjust') {
      if (item.toLocationId) quantities.set(key(item.toLocationId, item.drinkId), item.countedQuantity ?? 0);
      continue;
    }
    if (item.fromLocationId) add(item.fromLocationId, item.drinkId, -item.quantity);
    if (item.toLocationId) add(item.toLocationId, item.drinkId, item.quantity);
  }
  return [...decreased.entries()]
    .map(([k, pair]) => ({ ...pair, resulting: quantities.get(k) ?? 0 }))
    .filter((r) => r.resulting < 0);
}
