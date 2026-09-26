import type { NextRequest } from 'next/server';
import { getCurrentStaff } from '@/lib/auth/current';
import { toCsv } from '@/lib/csv';
import { formatDateTime } from '@/lib/dates';
import { getDb } from '@/lib/db/client';
import { MOVEMENT_TYPE_LABELS } from '@/lib/movementLabels';
import { parseMovementFilter } from '@/lib/movementFilter';
import { listMovements } from '@/lib/repo/movements';

export async function GET(request: NextRequest) {
  if (!(await getCurrentStaff())) return new Response('Unauthorized', { status: 401 });
  const filter = parseMovementFilter(Object.fromEntries(request.nextUrl.searchParams));
  const LIMIT = 50000;
  const fetched = await listMovements(getDb(), filter, LIMIT + 1);
  const truncated = fetched.length > LIMIT;
  const rows = truncated ? fetched.slice(0, LIMIT) : fetched;
  const csv = toCsv(
    ['日時', '種類', 'ドリンク', '移動元', '移動先', '本数（棚卸は差分）', '棚卸の実数', 'メモ', '操作した人', '取り消し日時', '取り消した人'],
    rows.map((m) => [
      formatDateTime(m.createdAt),
      MOVEMENT_TYPE_LABELS[m.type],
      m.drinkName,
      m.fromLocationName,
      m.toLocationName,
      m.quantity,
      m.countedQuantity,
      m.note,
      m.staffName,
      m.voidedAt ? formatDateTime(m.voidedAt) : null,
      m.voidedByName,
    ]),
  );
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="movements.csv"',
      'Cache-Control': 'no-store',
      ...(truncated ? { 'X-Truncated': 'true' } : {}),
    },
  });
}
