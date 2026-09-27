import type { Db } from '../db/types';
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

export async function getStockLevels(db: Db): Promise<StockLevel[]> {
  return db.query<StockLevel>(
    'select location_id as "locationId", drink_id as "drinkId", quantity from stock_levels',
  );
}

export async function batchExists(db: Db, batchId: string): Promise<boolean> {
  const rows = await db.query('select 1 from stock_movements where batch_id = $1 limit 1', [batchId]);
  return rows.length > 0;
}

/** Applies the batch atomically (see apply_movements). Returns the ids of the stored movements. */
export async function applyMovements(
  db: Db,
  batchId: string,
  staffId: string,
  items: MovementInput[],
): Promise<string[]> {
  const payload = items.map((i) => ({
    type: i.type,
    drink_id: i.drinkId,
    from_location_id: i.fromLocationId,
    to_location_id: i.toLocationId,
    quantity: i.type === 'adjust' ? null : i.quantity,
    counted_quantity: i.countedQuantity,
    reason: i.reason ?? null,
    note: i.note,
  }));
  // Pass the payload as a plain array/object, not a pre-serialized JSON string: the postgres
  // driver then tags the parameter as jsonb itself, which round-trips correctly everywhere.
  // (A pre-stringified value combined with an `::jsonb` cast on the bound parameter is
  // double-encoded by at least one Postgres wire-protocol implementation we run against,
  // producing a jsonb *string* instead of an array.)
  const rows = await db.query<{ id: string }>('select id from apply_movements($1, $2, $3::jsonb)', [
    batchId,
    staffId,
    payload,
  ]);
  return rows.map((r) => r.id);
}
