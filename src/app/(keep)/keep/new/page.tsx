import { getDb } from '@/lib/db/client';
import { todayJst } from '@/lib/keep';
import { listCategories } from '@/lib/repo/categories';
import { listDrinks } from '@/lib/repo/drinks';
import { KeepForm } from './KeepForm';

export default async function KeepNewPage() {
  const db = getDb();
  const [drinks, categories] = await Promise.all([listDrinks(db), listCategories(db)]);
  if (drinks.length === 0) {
    return <p>お酒が登録されていません。在庫管理の「ボトル」から登録してください。</p>;
  }
  return <KeepForm drinks={drinks} categories={categories} today={todayJst()} />;
}
