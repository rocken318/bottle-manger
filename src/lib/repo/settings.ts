import type { Db } from '../db/types';
import { writeAudit } from './audit';

export interface CostSettings {
  /** Consumption tax rate in percent (10 = 10%). */
  taxRate: number;
  /** Stocktake differences of at least this many bottles are highlighted. */
  varianceQtyThreshold: number;
  /** Stocktake differences of at least this many yen are highlighted. */
  varianceAmountThreshold: number;
}

export const DEFAULT_COST_SETTINGS: CostSettings = { taxRate: 10, varianceQtyThreshold: 5, varianceAmountThreshold: 3000 };

const KEYS: Record<keyof CostSettings, string> = {
  taxRate: 'tax_rate',
  varianceQtyThreshold: 'variance_qty_threshold',
  varianceAmountThreshold: 'variance_amount_threshold',
};

const FIELDS = Object.keys(KEYS) as (keyof CostSettings)[];

async function readSettings(db: Db, forUpdate: boolean): Promise<CostSettings> {
  const rows = await db.query<{ key: string; value: unknown }>(
    `select key, value from app_settings ${forUpdate ? 'for update' : ''}`,
  );
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const out = { ...DEFAULT_COST_SETTINGS };
  for (const field of FIELDS) {
    const n = Number(byKey.get(KEYS[field]));
    if (byKey.has(KEYS[field]) && Number.isFinite(n)) out[field] = n;
  }
  return out;
}

export function getCostSettings(db: Db): Promise<CostSettings> {
  return readSettings(db, false);
}

/** Saves the settings and audits the changed values (settings.update). Does nothing if nothing changed. */
export async function updateCostSettings(db: Db, actorId: string, next: CostSettings): Promise<void> {
  await db.transaction(async (tx) => {
    const current = await readSettings(tx, true);
    const changed = FIELDS.filter((f) => current[f] !== next[f]);
    if (changed.length === 0) return;
    for (const field of changed) {
      await tx.query(
        `insert into app_settings (key, value, updated_by, updated_at) values ($1, to_jsonb($2::numeric), $3, now())
         on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`,
        [KEYS[field], String(next[field]), actorId],
      );
    }
    await writeAudit(tx, {
      staffId: actorId,
      action: 'settings.update',
      targetType: 'app_settings',
      targetId: null,
      details: {
        before: Object.fromEntries(changed.map((f) => [f, current[f]])),
        after: Object.fromEntries(changed.map((f) => [f, next[f]])),
      },
    });
  });
}
