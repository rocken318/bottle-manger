import { getCurrentStaff } from '@/lib/auth/current';
import { toCsv } from '@/lib/csv';
import { getDb } from '@/lib/db/client';
import { listDrinks } from '@/lib/repo/drinks';
import { listLocations } from '@/lib/repo/locations';
import { getStockLevels } from '@/lib/repo/stock';
import { isAdminRole } from '@/lib/permissions';

export async function GET() {
  const staff = await getCurrentStaff();
  if (!staff) return new Response('Unauthorized', { status: 401 });
  if (!isAdminRole(staff.role)) return new Response('Forbidden', { status: 403 });
  const db = getDb();
  const [locations, drinks, levels] = await Promise.all([
    listLocations(db, { includeInactive: true }),
    listDrinks(db, { includeInactive: true }),
    getStockLevels(db),
  ]);
  const qty = new Map(levels.map((l) => [`${l.locationId}:${l.drinkId}`, l.quantity]));

  // Inactive locations/drinks are only shown when they still carry non-zero stock somewhere;
  // otherwise they'd just be empty columns/rows cluttering the export.
  const locationHasStock = (locationId: string) => drinks.some((d) => (qty.get(`${locationId}:${d.id}`) ?? 0) !== 0);
  const visibleLocations = locations.filter((l) => l.isActive || locationHasStock(l.id));

  const drinkHasStock = (drinkId: string) =>
    visibleLocations.some((l) => (qty.get(`${l.id}:${drinkId}`) ?? 0) !== 0);
  const visibleDrinks = drinks.filter((d) => d.isActive || drinkHasStock(d.id));

  const locationLabel = (l: (typeof locations)[number]) => (l.isActive ? l.name : `${l.name}（無効）`);
  const drinkLabel = (d: (typeof drinks)[number]) => (d.isActive ? d.name : `${d.name}（廃止）`);

  const csv = toCsv(
    ['ボトル', '1ケースの本数', ...visibleLocations.map((l) => `${locationLabel(l)}（本）`), '合計（本）'],
    visibleDrinks.map((d) => {
      const perLocation = visibleLocations.map((l) => qty.get(`${l.id}:${d.id}`) ?? 0);
      return [drinkLabel(d), d.unitsPerCase, ...perLocation, perLocation.reduce((a, b) => a + b, 0)];
    }),
  );
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="stock.csv"',
      'Cache-Control': 'no-store',
    },
  });
}
