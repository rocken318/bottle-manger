import { requireStaff } from '@/lib/auth/current';
import { getDb } from '@/lib/db/client';
import { listDrinks } from '@/lib/repo/drinks';
import { listLocations } from '@/lib/repo/locations';
import { getStockLevels } from '@/lib/repo/stock';
import { StockView } from './StockView';

export default async function StockPage() {
  const staff = await requireStaff();
  const db = getDb();
  const [locations, drinks, levels] = await Promise.all([listLocations(db), listDrinks(db), getStockLevels(db)]);
  const defaultLocationId =
    locations.find((l) => l.id === staff.homeLocationId)?.id ?? locations[0]?.id ?? 'all';
  return <StockView locations={locations} drinks={drinks} levels={levels} defaultLocationId={defaultLocationId} />;
}
