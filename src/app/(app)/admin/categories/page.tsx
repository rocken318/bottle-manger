import Link from 'next/link';
import { requireAdmin } from '@/lib/auth/current';
import { getDb } from '@/lib/db/client';
import { listCategories } from '@/lib/repo/categories';
import { CategoryCreateForm, CategoryEditForm } from './CategoryForms';
import { PageHelp } from '../../PageHelp';

export default async function CategoriesAdminPage() {
  await requireAdmin();
  const db = getDb();
  const categories = await listCategories(db, { includeInactive: true });
  const counts = await db.query<{ categoryId: string | null; n: string }>(
    'select category_id as "categoryId", count(*)::text as n from drinks group by category_id',
  );
  const countOf = new Map(counts.map((r) => [r.categoryId, Number(r.n)]));
  const uncategorized = countOf.get(null) ?? 0;
  const nextSortOrder = Math.max(0, ...categories.map((c) => c.sortOrder)) + 1;

  return (
    <div className="space-y-4">
      <Link href="/admin" className="text-sm text-blue-700 underline">
        ← 管理
      </Link>
      <PageHelp>
        <ul>
          <li>お酒の種類（焼酎・ウイスキーなど）をここで管理します。</li>
          <li>新しい種類は「種類の名前」を入れて「追加」を押します。</li>
          <li>「表示順」は小さい数ほど上に出ます。ボトル一覧もこの順に並びます。</li>
          <li>名前や表示順を変えたら、その行の「保存」を押します。</li>
          <li>使わない種類は「有効」のチェックを外して「保存」します。その種類のボトルは「未分類」になります（ボトルは消えません）。</li>
          <li>どのボトルがどの種類かは「ボトル」の画面で変えられます（スタッフも変えられます）。</li>
        </ul>
      </PageHelp>
      <CategoryCreateForm nextSortOrder={nextSortOrder} />
      <div className="flex items-center justify-between">
        <h2 className="font-bold">種類の一覧</h2>
        <Link href="/drinks?category=none" className="text-sm text-blue-700 underline">
          未分類 {uncategorized}本
        </Link>
      </div>
      <ul className="divide-y rounded border bg-white">
        {categories.map((c) => (
          <li key={c.id} className={c.isActive ? '' : 'bg-gray-50'}>
            <CategoryEditForm category={c} drinkCount={countOf.get(c.id) ?? 0} />
          </li>
        ))}
      </ul>
    </div>
  );
}
