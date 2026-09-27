// Queries for the cost report (spec 11.2). All dates are the movement's created_at in JST;
// voided movements are ignored. Prices are looked up per JST date with priceOnSql.
import { buildMonthlyRows, type FlowKind, type MonthLine, type MonthlySummary } from '../costs/report';
import { monthStart, monthsBetween, nextMonth, type CostFilter } from '../costs/period';
import { jstDayStart } from '../dates';
import type { Db } from '../db/types';
import type { DisposeReason } from '../types';
import { listDrinks } from './drinks';
import { listLocations } from './locations';
import { parseCents } from '../costs/money';
import { priceOnSql, toCentsOrNull } from './prices';

/** Signed stock deltas per location with the movement's JST date. Transfers become _in / _out. */
const DELTAS_SQL = `
  select m.to_location_id as location_id, m.drink_id, m.quantity as delta,
         case when m.type = 'transfer' then 'transfer_in' else m.type end as kind,
         (m.created_at at time zone 'Asia/Tokyo')::date as d
    from stock_movements m
   where m.voided_at is null and m.to_location_id is not null
  union all
  select m.from_location_id, m.drink_id, -m.quantity,
         case when m.type = 'transfer' then 'transfer_out' else m.type end,
         (m.created_at at time zone 'Asia/Tokyo')::date
    from stock_movements m
   where m.voided_at is null and m.from_location_id is not null`;

/** $1 = first month start (date), $2 = number of months - 1. */
const MONTHS_SQL = `
  select (($1::date + make_interval(months => i))::date) as month_start,
         (($1::date + make_interval(months => i + 1))::date) as next_start
    from generate_series(0, $2::integer) as i`;

function filteredDeltas(filter: CostFilter, params: unknown[]): string {
  if (!filter.locationId) return DELTAS_SQL;
  params.push(filter.locationId);
  return `select * from (${DELTAS_SQL}) as all_deltas where location_id = $${params.length}`;
}

/** One line per (location, month, drink) that has had any movement up to the end of that month. */
export async function getMonthLines(db: Db, filter: CostFilter): Promise<MonthLine[]> {
  const months = monthsBetween(filter.fromMonth, filter.toMonth);
  const params: unknown[] = [monthStart(filter.fromMonth), months.length - 1];
  const deltas = filteredDeltas(filter, params);

  const balances = await db.query<{
    locationId: string;
    drinkId: string;
    month: string;
    openingQty: number;
    closingQty: number;
    openingUnitCost: string | null;
    closingUnitCost: string | null;
  }>(
    `with months as (${MONTHS_SQL}), f as (${deltas})
     select b.location_id as "locationId", b.drink_id as "drinkId", to_char(b.month_start, 'YYYY-MM') as month,
            b.opening_qty::integer as "openingQty", b.closing_qty::integer as "closingQty",
            ${priceOnSql('b.drink_id', 'b.month_start')}::text as "openingUnitCost",
            ${priceOnSql('b.drink_id', '(b.next_start - 1)')}::text as "closingUnitCost"
       from (
         select f.location_id, f.drink_id, mo.month_start, mo.next_start,
                coalesce(sum(f.delta) filter (where f.d < mo.month_start), 0) as opening_qty,
                sum(f.delta) as closing_qty
           from f
           join months mo on f.d < mo.next_start
          group by f.location_id, f.drink_id, mo.month_start, mo.next_start
       ) as b
      order by b.month_start, b.location_id, b.drink_id`,
    params,
  );

  const flows = await db.query<{
    locationId: string;
    drinkId: string;
    month: string;
    kind: FlowKind;
    qty: number;
    amount: string | null;
    missing: boolean;
  }>(
    `with months as (${MONTHS_SQL}), f as (${deltas})
     select g.location_id as "locationId", g.drink_id as "drinkId", to_char(g.month_start, 'YYYY-MM') as month,
            g.kind, sum(g.qty)::integer as qty, sum(g.qty * g.unit_cost)::text as amount,
            coalesce(bool_or(g.unit_cost is null and g.qty <> 0), false) as missing
       from (
         select f.location_id, f.drink_id, mo.month_start, f.kind,
                case when f.kind in ('transfer_out', 'dispose') then -f.delta else f.delta end as qty,
                ${priceOnSql('f.drink_id', 'f.d')} as unit_cost
           from f
           join months mo on f.d >= mo.month_start and f.d < mo.next_start
          where f.kind <> 'sale'
       ) as g
      group by g.location_id, g.drink_id, g.month_start, g.kind`,
    params,
  );

  const key = (r: { locationId: string; month: string; drinkId: string }) => `${r.locationId}|${r.month}|${r.drinkId}`;
  const lines = new Map<string, MonthLine>();
  for (const b of balances) {
    lines.set(key(b), {
      locationId: b.locationId,
      month: b.month,
      drinkId: b.drinkId,
      openingQty: Number(b.openingQty),
      openingUnitCents: toCentsOrNull(b.openingUnitCost),
      closingQty: Number(b.closingQty),
      closingUnitCents: toCentsOrNull(b.closingUnitCost),
      flows: {},
    });
  }
  for (const f of flows) {
    const line = lines.get(key(f));
    // Every flow lies before the month's end, so its balance line always exists.
    if (!line) throw new Error('cost_line_missing');
    line.flows[f.kind] = {
      qty: Number(f.qty),
      amountCents: f.amount === null ? 0 : parseCents(f.amount),
      missing: Boolean(f.missing),
    };
  }
  return [...lines.values()];
}

export interface MonthlyReportRow extends MonthlySummary {
  locationName: string;
}

export interface MonthlyReport {
  months: string[];
  rows: MonthlyReportRow[];
  lines: MonthLine[];
  /** Drinks left out of some amount because their price is not set. */
  missingDrinks: { id: string; name: string }[];
}

export const TOTAL_LABEL = '全店合計';

export async function loadMonthlyReport(db: Db, filter: CostFilter, taxRate: number): Promise<MonthlyReport> {
  const [lines, locations, drinks] = await Promise.all([
    getMonthLines(db, filter),
    listLocations(db, { includeInactive: true }),
    listDrinks(db, { includeInactive: true }),
  ]);
  const months = monthsBetween(filter.fromMonth, filter.toMonth);
  const shown = filter.locationId ? locations.filter((l) => l.id === filter.locationId) : locations;
  const locationName = new Map(locations.map((l) => [l.id, l.name]));
  const rows = buildMonthlyRows({ months, locations: shown, lines, taxRate, includeTotal: !filter.locationId }).map(
    (r) => ({ ...r, locationName: r.locationId === null ? TOTAL_LABEL : (locationName.get(r.locationId) ?? '') }),
  );
  const missingIds = new Set(rows.flatMap((r) => r.missingDrinkIds));
  const missingDrinks = drinks.filter((d) => missingIds.has(d.id)).map((d) => ({ id: d.id, name: d.name }));
  return { months, rows, lines, missingDrinks };
}

function periodParams(filter: CostFilter): unknown[] {
  return [
    jstDayStart(monthStart(filter.fromMonth)).toISOString(),
    jstDayStart(monthStart(nextMonth(filter.toMonth))).toISOString(),
  ];
}

export interface PurchaseDetail {
  id: string;
  /** JST date (YYYY-MM-DD). */
  date: string;
  createdAt: Date;
  locationId: string;
  locationName: string;
  drinkId: string;
  drinkName: string;
  quantity: number;
  unitCents: number | null;
  staffName: string;
  note: string | null;
}

/** Non-voided receives in the period (oldest first) with the price on each JST receive date. */
export async function listPurchaseDetails(db: Db, filter: CostFilter): Promise<PurchaseDetail[]> {
  const params = periodParams(filter);
  let where = '';
  if (filter.locationId) {
    params.push(filter.locationId);
    where = `and m.to_location_id = $${params.length}`;
  }
  const rows = await db.query<Omit<PurchaseDetail, 'unitCents'> & { unitCost: string | null }>(
    `select m.id, to_char((m.created_at at time zone 'Asia/Tokyo')::date, 'YYYY-MM-DD') as date,
            m.created_at as "createdAt", m.to_location_id as "locationId", l.name as "locationName",
            m.drink_id as "drinkId", d.name as "drinkName", m.quantity,
            ${priceOnSql('m.drink_id', "(m.created_at at time zone 'Asia/Tokyo')::date")}::text as "unitCost",
            s.name as "staffName", m.note
       from stock_movements m
       join locations l on l.id = m.to_location_id
       join drinks d on d.id = m.drink_id
       join staff s on s.id = m.staff_id
      where m.type = 'receive' and m.voided_at is null
        and m.created_at >= $1::timestamptz and m.created_at < $2::timestamptz ${where}
      order by m.created_at, m.batch_id, m.line_no`,
    params,
  );
  return rows.map(({ unitCost, ...r }) => ({ ...r, quantity: Number(r.quantity), unitCents: toCentsOrNull(unitCost) }));
}

export interface VarianceDetail {
  id: string;
  createdAt: Date;
  locationId: string;
  locationName: string;
  staffName: string;
  drinkId: string;
  drinkName: string;
  /** Book stock just before the count (counted − difference). */
  bookQty: number;
  countedQty: number;
  diffQty: number;
  unitCents: number | null;
}

/** Non-voided stocktakes (adjust) in the period, newest first, with the price on the JST count date. */
export async function listVarianceDetails(db: Db, filter: CostFilter): Promise<VarianceDetail[]> {
  const params = periodParams(filter);
  let where = '';
  if (filter.locationId) {
    params.push(filter.locationId);
    where = `and m.to_location_id = $${params.length}`;
  }
  const rows = await db.query<Omit<VarianceDetail, 'unitCents'> & { unitCost: string | null }>(
    `select m.id, m.created_at as "createdAt", m.to_location_id as "locationId", l.name as "locationName",
            s.name as "staffName", m.drink_id as "drinkId", d.name as "drinkName",
            (m.counted_quantity - m.quantity) as "bookQty", m.counted_quantity as "countedQty", m.quantity as "diffQty",
            ${priceOnSql('m.drink_id', "(m.created_at at time zone 'Asia/Tokyo')::date")}::text as "unitCost"
       from stock_movements m
       join locations l on l.id = m.to_location_id
       join drinks d on d.id = m.drink_id
       join staff s on s.id = m.staff_id
      where m.type = 'adjust' and m.voided_at is null
        and m.created_at >= $1::timestamptz and m.created_at < $2::timestamptz ${where}
      order by m.created_at desc, m.batch_id, m.line_no`,
    params,
  );
  return rows.map(({ unitCost, ...r }) => ({
    ...r,
    bookQty: Number(r.bookQty),
    countedQty: Number(r.countedQty),
    diffQty: Number(r.diffQty),
    unitCents: toCentsOrNull(unitCost),
  }));
}

export interface DisposeDetail {
  id: string;
  createdAt: Date;
  locationId: string;
  locationName: string;
  staffName: string;
  drinkId: string;
  drinkName: string;
  quantity: number;
  reason: DisposeReason;
  note: string | null;
  photoIds: string[];
  unitCents: number | null;
}

/** Non-voided 破損・廃棄 in the period, newest first, with the price on the JST date. */
export async function listDisposeDetails(db: Db, filter: CostFilter): Promise<DisposeDetail[]> {
  const params = periodParams(filter);
  let where = '';
  if (filter.locationId) {
    params.push(filter.locationId);
    where = `and m.from_location_id = $${params.length}`;
  }
  const rows = await db.query<Omit<DisposeDetail, 'unitCents'> & { unitCost: string | null }>(
    `select m.id, m.created_at as "createdAt", m.from_location_id as "locationId", l.name as "locationName",
            s.name as "staffName", m.drink_id as "drinkId", d.name as "drinkName", m.quantity, m.reason, m.note,
            coalesce((select array_agg(p.id::text order by p.created_at) from movement_photos p
                       where p.batch_id = m.batch_id), '{}') as "photoIds",
            ${priceOnSql('m.drink_id', "(m.created_at at time zone 'Asia/Tokyo')::date")}::text as "unitCost"
       from stock_movements m
       join locations l on l.id = m.from_location_id
       join drinks d on d.id = m.drink_id
       join staff s on s.id = m.staff_id
      where m.type = 'dispose' and m.voided_at is null
        and m.created_at >= $1::timestamptz and m.created_at < $2::timestamptz ${where}
      order by m.created_at desc, m.batch_id, m.line_no`,
    params,
  );
  return rows.map(({ unitCost, ...r }) => ({
    ...r,
    quantity: Number(r.quantity),
    unitCents: toCentsOrNull(unitCost),
  }));
}
