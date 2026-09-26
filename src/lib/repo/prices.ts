import { casePriceToUnitCents, formatCents, parseCents } from '../costs/money';
import type { Db } from '../db/types';
import { writeAudit } from './audit';

export interface PriceRow {
  id: string;
  drinkId: string;
  drinkName: string;
  unitCents: number;
  /** JST date (YYYY-MM-DD). */
  effectiveFrom: string;
  createdByName: string | null;
  createdAt: Date;
}

export interface SavePriceInput {
  drinkId: string;
  effectiveFrom: string;
  /** 'case': amountCents is the price of one case and is divided by the drink's units per case. */
  mode: 'unit' | 'case';
  amountCents: number;
}

/** SQL for the price of drink `drinkExpr` effective on date `dateExpr` (null when none). */
export const priceOnSql = (drinkExpr: string, dateExpr: string) =>
  `(select p.unit_cost from drink_prices p
     where p.drink_id = ${drinkExpr} and p.effective_from <= ${dateExpr}
     order by p.effective_from desc limit 1)`;

export const toCentsOrNull = (v: string | number | null): number | null => (v === null ? null : parseCents(v));

export async function getPriceOn(db: Db, drinkId: string, date: string): Promise<number | null> {
  const [row] = await db.query<{ unitCost: string | null }>(
    `select ${priceOnSql('$1', '$2::date')}::text as "unitCost"`,
    [drinkId, date],
  );
  return toCentsOrNull(row?.unitCost ?? null);
}

/** The price in effect on `date` for every drink that has one. */
export async function listCurrentPrices(
  db: Db,
  date: string,
): Promise<Map<string, { unitCents: number; effectiveFrom: string }>> {
  const rows = await db.query<{ drinkId: string; unitCost: string; effectiveFrom: string }>(
    `select distinct on (drink_id) drink_id as "drinkId", unit_cost::text as "unitCost",
            to_char(effective_from, 'YYYY-MM-DD') as "effectiveFrom"
       from drink_prices
      where effective_from <= $1::date
      order by drink_id, effective_from desc`,
    [date],
  );
  return new Map(rows.map((r) => [r.drinkId, { unitCents: parseCents(r.unitCost), effectiveFrom: r.effectiveFrom }]));
}

export async function listPriceHistory(db: Db): Promise<PriceRow[]> {
  const rows = await db.query<Omit<PriceRow, 'unitCents'> & { unitCost: string }>(
    `select p.id, p.drink_id as "drinkId", d.name as "drinkName", p.unit_cost::text as "unitCost",
            to_char(p.effective_from, 'YYYY-MM-DD') as "effectiveFrom", s.name as "createdByName",
            p.created_at as "createdAt"
       from drink_prices p
       join drinks d on d.id = p.drink_id
       left join staff s on s.id = p.created_by
      order by d.name, p.effective_from desc`,
  );
  return rows.map(({ unitCost, ...r }) => ({ ...r, unitCents: parseCents(unitCost) }));
}

/**
 * Adds a price, or overwrites the one with the same drink and effective date (price.create /
 * price.update in audit_logs). Saving the same value again changes nothing.
 */
export async function savePrice(
  db: Db,
  actorId: string,
  input: SavePriceInput,
): Promise<{ id: string; unitCents: number; action: 'create' | 'update' | 'none' }> {
  return db.transaction(async (tx) => {
    // Locking the drink serializes concurrent saves for it (no unique-violation race).
    const [drink] = await tx.query<{ name: string; unitsPerCase: number }>(
      'select name, units_per_case as "unitsPerCase" from drinks where id = $1 for update',
      [input.drinkId],
    );
    if (!drink) throw new Error('drink_not_found');
    const unitCents = input.mode === 'case' ? casePriceToUnitCents(input.amountCents, drink.unitsPerCase) : input.amountCents;
    const unitCost = formatCents(unitCents);
    const details: Record<string, unknown> = { name: drink.name, effectiveFrom: input.effectiveFrom, unitCost };
    if (input.mode === 'case') {
      details.casePrice = formatCents(input.amountCents);
      details.unitsPerCase = drink.unitsPerCase;
    }

    const [existing] = await tx.query<{ id: string; unitCost: string }>(
      `select id, unit_cost::text as "unitCost" from drink_prices
        where drink_id = $1 and effective_from = $2::date`,
      [input.drinkId, input.effectiveFrom],
    );
    if (existing) {
      if (parseCents(existing.unitCost) === unitCents) return { id: existing.id, unitCents, action: 'none' as const };
      await tx.query(
        'update drink_prices set unit_cost = $2::numeric, created_by = $3, created_at = now() where id = $1',
        [existing.id, unitCost, actorId],
      );
      await writeAudit(tx, {
        staffId: actorId,
        action: 'price.update',
        targetType: 'drink_price',
        targetId: existing.id,
        details: { ...details, before: { unitCost: formatCents(parseCents(existing.unitCost)) } },
      });
      return { id: existing.id, unitCents, action: 'update' as const };
    }

    const [created] = await tx.query<{ id: string }>(
      `insert into drink_prices (drink_id, unit_cost, effective_from, created_by)
       values ($1, $2::numeric, $3::date, $4) returning id`,
      [input.drinkId, unitCost, input.effectiveFrom, actorId],
    );
    await writeAudit(tx, {
      staffId: actorId,
      action: 'price.create',
      targetType: 'drink_price',
      targetId: created.id,
      details,
    });
    return { id: created.id, unitCents, action: 'create' as const };
  });
}

export async function deletePrice(db: Db, actorId: string, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [deleted] = await tx.query<{ drinkId: string; unitCost: string; effectiveFrom: string }>(
      `delete from drink_prices where id = $1
       returning drink_id as "drinkId", unit_cost::text as "unitCost", to_char(effective_from, 'YYYY-MM-DD') as "effectiveFrom"`,
      [id],
    );
    if (!deleted) throw new Error('price_not_found');
    const [drink] = await tx.query<{ name: string }>('select name from drinks where id = $1', [deleted.drinkId]);
    await writeAudit(tx, {
      staffId: actorId,
      action: 'price.delete',
      targetType: 'drink_price',
      targetId: id,
      details: {
        name: drink?.name ?? null,
        effectiveFrom: deleted.effectiveFrom,
        unitCost: formatCents(parseCents(deleted.unitCost)),
      },
    });
  });
}
