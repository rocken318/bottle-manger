import type { Db } from '../db/types';
import { jstDayStart, jstNextDayStart } from '../dates';
import type { MovementFilter } from '../movementFilter';
import type { Movement } from '../types';

export async function listMovements(db: Db, filter: MovementFilter, limit: number): Promise<Movement[]> {
  const safe = Math.min(Math.max(1, Math.trunc(limit) || 1), 100000);
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: (p: string) => string, value: unknown) => {
    params.push(value);
    where.push(sql(`$${params.length}`));
  };
  if (filter.locationId) add((p) => `(m.from_location_id = ${p} or m.to_location_id = ${p})`, filter.locationId);
  if (filter.drinkId) add((p) => `m.drink_id = ${p}`, filter.drinkId);
  if (filter.staffId) add((p) => `m.staff_id = ${p}`, filter.staffId);
  if (filter.type) add((p) => `m.type = ${p}`, filter.type);
  if (filter.fromDate) add((p) => `m.created_at >= ${p}::timestamptz`, jstDayStart(filter.fromDate).toISOString());
  if (filter.toDate) add((p) => `m.created_at < ${p}::timestamptz`, jstNextDayStart(filter.toDate).toISOString());
  params.push(safe);

  return db.query<Movement>(
    `select m.id, m.batch_id as "batchId", m.type, m.drink_id as "drinkId", d.name as "drinkName",
            d.units_per_case as "unitsPerCase",
            m.from_location_id as "fromLocationId", fl.name as "fromLocationName",
            m.to_location_id as "toLocationId", tl.name as "toLocationName",
            m.quantity, m.counted_quantity as "countedQuantity", m.note,
            m.staff_id as "staffId", s.name as "staffName", m.created_at as "createdAt",
            m.voided_at as "voidedAt", vs.name as "voidedByName"
       from stock_movements m
       join drinks d on d.id = m.drink_id
       join staff s on s.id = m.staff_id
       left join locations fl on fl.id = m.from_location_id
       left join locations tl on tl.id = m.to_location_id
       left join staff vs on vs.id = m.voided_by
      ${where.length ? `where ${where.join(' and ')}` : ''}
      order by m.created_at desc, m.batch_id, m.line_no
      limit $${params.length}`,
    params,
  );
}

export async function getMovementForVoid(
  db: Db,
  id: string,
): Promise<{ id: string; staffId: string; createdAt: Date; voidedAt: Date | null } | null> {
  const rows = await db.query<{ id: string; staffId: string; createdAt: Date; voidedAt: Date | null }>(
    `select id, staff_id as "staffId", created_at as "createdAt", voided_at as "voidedAt"
       from stock_movements where id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function voidMovement(db: Db, id: string, actorId: string): Promise<void> {
  await db.query('select void_movement($1, $2)', [id, actorId]);
}
