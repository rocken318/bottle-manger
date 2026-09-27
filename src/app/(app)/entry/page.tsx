import { requireStaff } from '@/lib/auth/current';
import { getDb } from '@/lib/db/client';
import { listDrinks } from '@/lib/repo/drinks';
import { listLocations } from '@/lib/repo/locations';
import { getStockLevels } from '@/lib/repo/stock';
import { idSchema } from '@/lib/validation';
import { EntryForm } from './EntryForm';

const param = (v: string | string[] | undefined) => {
  const parsed = idSchema.safeParse(Array.isArray(v) ? v[0] : v);
  return parsed.success ? parsed.data : null;
};

export default async function EntryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await requireStaff();
  const params = await searchParams;
  const drinkParam = param(params.drink);
  const locationParam = param(params.location);
  const db = getDb();
  const [drinks, locations, levels] = await Promise.all([listDrinks(db), listLocations(db), getStockLevels(db)]);
  if (locations.length === 0) return <p>有効な拠点がありません。管理者に連絡してください。</p>;
  if (drinks.length === 0) return <p>ボトルが登録されていません。「ボトル」タブから登録してください。</p>;
  const defaultLocationId =
    locations.find((l) => l.id === locationParam)?.id ??
    locations.find((l) => l.id === staff.homeLocationId)?.id ??
    locations[0].id;
  const initialQuery = drinks.find((d) => d.id === drinkParam)?.name ?? '';
  return (
    <EntryForm
      // Remount when opened from another link (e.g. a different drink on the stock page)
      // so the initial search/location are applied again.
      key={`${drinkParam ?? ''}:${locationParam ?? ''}`}
      drinks={drinks}
      locations={locations}
      levels={levels}
      defaultLocationId={defaultLocationId}
      initialQuery={initialQuery}
    />
  );
}
