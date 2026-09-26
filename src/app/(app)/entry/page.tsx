import { requireStaff } from '@/lib/auth/current';
import { getDb } from '@/lib/db/client';
import { listDrinks } from '@/lib/repo/drinks';
import { listLocations } from '@/lib/repo/locations';
import { getStockLevels } from '@/lib/repo/stock';
import { EntryForm } from './EntryForm';

export default async function EntryPage() {
  const staff = await requireStaff();
  const db = getDb();
  const [drinks, locations, levels] = await Promise.all([listDrinks(db), listLocations(db), getStockLevels(db)]);
  if (locations.length === 0) return <p>有効な拠点がありません。管理者に連絡してください。</p>;
  if (drinks.length === 0) return <p>ドリンクが登録されていません。「ドリンク」タブから登録してください。</p>;
  const defaultLocationId = locations.find((l) => l.id === staff.homeLocationId)?.id ?? locations[0].id;
  return <EntryForm drinks={drinks} locations={locations} levels={levels} defaultLocationId={defaultLocationId} />;
}
