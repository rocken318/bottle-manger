// Period/location filter for the cost pages and CSVs. Months are JST calendar months (YYYY-MM).

export interface CostFilter {
  fromMonth: string;
  toMonth: string;
  locationId?: string;
}

type Params = Record<string, string | string[] | undefined>;

/** Longest period that can be shown at once. */
export const MAX_MONTHS = 24;

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const jstParts = (now: Date) => {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return {
    y: jst.getUTCFullYear(),
    m: jst.getUTCMonth() + 1,
    d: jst.getUTCDate(),
  };
};
const pad = (n: number) => String(n).padStart(2, '0');

/** Today's date in Japan (YYYY-MM-DD). */
export function jstToday(now: Date = new Date()): string {
  const { y, m, d } = jstParts(now);
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** The current month in Japan (YYYY-MM). */
export function jstMonth(now: Date = new Date()): string {
  const { y, m } = jstParts(now);
  return `${y}-${pad(m)}`;
}

export function isValidMonth(s: string): boolean {
  return MONTH_PATTERN.test(s) && Number(s.slice(0, 4)) >= 2000;
}

const toIndex = (ym: string) => Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1;
const fromIndex = (i: number) => `${Math.floor(i / 12)}-${pad((i % 12) + 1)}`;

export function nextMonth(ym: string): string {
  return fromIndex(toIndex(ym) + 1);
}

export function addMonths(ym: string, n: number): string {
  return fromIndex(toIndex(ym) + n);
}

/** Every month from `from` to `to`, both inclusive. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let i = toIndex(from); i <= toIndex(to); i++) out.push(fromIndex(i));
  return out;
}

/** First JST day of the month (YYYY-MM-01). */
export function monthStart(ym: string): string {
  return `${ym}-01`;
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Reads `from`, `to` (YYYY-MM) and `location` (uuid) from the query. Invalid values are ignored
 * (defaults: the current JST month, all locations). A reversed range is swapped and a range longer
 * than MAX_MONTHS is shortened to the last MAX_MONTHS months; `notice` explains either.
 */
export function parseCostFilter(params: Params, now: Date = new Date()): { filter: CostFilter; notice: string | null } {
  const rawFrom = first(params.from);
  const rawTo = first(params.to);
  const location = first(params.location);
  const from = rawFrom && isValidMonth(rawFrom) ? rawFrom : undefined;
  const to = rawTo && isValidMonth(rawTo) ? rawTo : undefined;

  let fromMonth = from ?? to ?? jstMonth(now);
  let toMonth = to ?? from ?? fromMonth;
  let notice: string | null = null;
  if (fromMonth > toMonth) {
    [fromMonth, toMonth] = [toMonth, fromMonth];
    notice = '開始月が終了月より後だったため入れ替えました';
  }
  if (toIndex(toMonth) - toIndex(fromMonth) + 1 > MAX_MONTHS) {
    fromMonth = addMonths(toMonth, -(MAX_MONTHS - 1));
    notice = `期間は最大${MAX_MONTHS}か月です。${fromMonth}〜${toMonth} を表示しています`;
  }
  const filter: CostFilter = { fromMonth, toMonth };
  if (location && UUID_PATTERN.test(location)) filter.locationId = location;
  return { filter, notice };
}

export function costFilterToQuery(f: CostFilter): string {
  const q = new URLSearchParams({ from: f.fromMonth, to: f.toMonth });
  if (f.locationId) q.set('location', f.locationId);
  return q.toString();
}
