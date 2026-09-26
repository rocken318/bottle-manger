import { getCurrentStaff } from '@/lib/auth/current';
import { toCsv } from '@/lib/csv';
import { getDb } from '@/lib/db/client';
import { listDrinks } from '@/lib/repo/drinks';
import { listLocations } from '@/lib/repo/locations';
import { getStockLevels } from '@/lib/repo/stock';

export async function GET() {
  const staff = await getCurrentStaff();
  if (!staff) return new Response('Unauthorized', { status: 401 });
  if (staff.role !== 'admin') return new Response('Forbidden', { status: 403 });
  const db = getDb();
  const [locations, drinks, levels] = await Promise.all([listLocations(db), listDrinks(db), getStockLevels(db)]);
  const qty = new Map(levels.map((l) => [`${l.locationId}:${l.drinkId}`, l.quantity]));
  const csv = toCsv(
    ['ドリンク', '1ケースの本数', ...locations.map((l) => `${l.name}（本）`), '合計（本）'],
    drinks.map((d) => {
      const perLocation = locations.map((l) => qty.get(`${l.id}:${d.id}`) ?? 0);
      return [d.name, d.unitsPerCase, ...perLocation, perLocation.reduce((a, b) => a + b, 0)];
    }),
  );
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="stock.csv"',
    },
  });
}
