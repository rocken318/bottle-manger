import type { NextRequest } from 'next/server';
import { getCurrentStaff } from '@/lib/auth/current';
import { toCsv } from '@/lib/csv';
import { parseCostFilter, type CostFilter } from '@/lib/costs/period';
import { getDb } from '@/lib/db/client';
import type { Db } from '@/lib/db/types';
import { isAdminRole } from '@/lib/permissions';

type Cell = string | number | null;

/**
 * Common part of the cost CSV routes: admin only, the same period/location filter as the pages,
 * and a file name carrying the period (e.g. costs-monthly_2026-04_2026-09.csv).
 */
export async function costCsvResponse(
  request: NextRequest,
  name: string,
  build: (db: Db, filter: CostFilter) => Promise<{ header: string[]; rows: Cell[][] }>,
): Promise<Response> {
  const staff = await getCurrentStaff();
  if (!staff) return new Response('Unauthorized', { status: 401 });
  if (!isAdminRole(staff.role)) return new Response('Forbidden', { status: 403 });
  const { filter } = parseCostFilter(Object.fromEntries(request.nextUrl.searchParams));
  const { header, rows } = await build(getDb(), filter);
  return new Response(toCsv(header, rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="costs-${name}_${filter.fromMonth}_${filter.toMonth}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
