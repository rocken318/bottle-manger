import Link from 'next/link';
import { requireStaff } from '@/lib/auth/current';
import { getDb } from '@/lib/db/client';
import { listCategories } from '@/lib/repo/categories';
import { listDrinks } from '@/lib/repo/drinks';
import { DrinkCreateForm } from './DrinkCreateForm';
import { DrinkRow } from './DrinkRow';
import { PageHelp } from '../PageHelp';
import { isAdminRole } from '@/lib/permissions';

const UNCATEGORIZED = 'none';

export default async function DrinksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await requireStaff();
  const params = await searchParams;
  const showAll = params.all === '1';
  const selected = typeof params.category === 'string' ? params.category : null;

  const db = getDb();
  const [drinks, categories] = await Promise.all([
    listDrinks(db, { includeInactive: showAll }),
    listCategories(db),
  ]);
  const isAdmin = isAdminRole(staff.role);

  const visible = selected
    ? drinks.filter((d) => (selected === UNCATEGORIZED ? d.categoryId === null : d.categoryId === selected))
    : drinks;

  // 未分類は最後。listDrinks が既にこの順で返すので、その順を保ったまま束ねる。
  const groups: { key: string; label: string; drinks: typeof visible }[] = [];
  for (const d of visible) {
    const key = d.categoryId ?? UNCATEGORIZED;
    const label = d.categoryName ?? '未分類';
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.drinks.push(d);
    else groups.push({ key, label, drinks: [d] });
  }

  const uncategorized = drinks.filter((d) => d.categoryId === null).length;
  const keep = showAll ? '&all=1' : '';

  return (
    <div className="space-y-4">
      <PageHelp>
        <ul>
          <li>新しいボトルは「ボトル名」と「1ケースの本数」を入れて「登録」を押します。種類も選べます。</li>
          <li>1ケースの本数は、入力や在庫を「ケース＋本」で表示するのに使います。正しい数を入れてください。</li>
          <li>一覧の右にあるプルダウンで、そのボトルの種類をその場で変えられます（選んだ時点で保存されます）。</li>
          <li>種類そのもの（焼酎・ウイスキーなど）の追加や改名は、管理画面の「お酒の種類」からです（管理者・マスターのみ）。</li>
          <li>名前や1ケースの本数をまちがえたときは、一覧の「編集」から直せます。</li>
          <li>もう扱わないボトルは「廃止」にすると、入力や在庫一覧に出なくなります（管理者・マスターのみ）。</li>
          <li>廃止できるのは、全部の拠点で在庫が0本のときだけです。残っているときは棚卸などで0本にしてから廃止します。</li>
          <li>「廃止済みも表示」を押すと廃止したボトルも表示され、「復活」で元に戻せます。</li>
        </ul>
      </PageHelp>

      <DrinkCreateForm categories={categories} />

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold">種類でしぼる</span>
        <Link
          href={`/drinks${showAll ? '?all=1' : ''}`}
          className={`rounded border px-2 py-1 text-sm ${selected === null ? 'bg-blue-600 text-white' : 'bg-white'}`}
        >
          すべて {drinks.length}
        </Link>
        {categories.map((c) => {
          const n = drinks.filter((d) => d.categoryId === c.id).length;
          return (
            <Link
              key={c.id}
              href={`/drinks?category=${c.id}${keep}`}
              className={`rounded border px-2 py-1 text-sm ${selected === c.id ? 'bg-blue-600 text-white' : 'bg-white'}`}
            >
              {c.name} {n}
            </Link>
          );
        })}
        {uncategorized > 0 && (
          <Link
            href={`/drinks?category=${UNCATEGORIZED}${keep}`}
            className={`rounded border px-2 py-1 text-sm ${
              selected === UNCATEGORIZED ? 'bg-blue-600 text-white' : 'bg-amber-50 text-amber-800'
            }`}
          >
            未分類 {uncategorized}
          </Link>
        )}
      </div>

      <div className="flex items-center justify-between">
        <h2 className="font-bold">ボトル一覧</h2>
        <Link
          href={showAll ? `/drinks${selected ? `?category=${selected}` : ''}` : `/drinks?all=1${selected ? `&category=${selected}` : ''}`}
          className="text-sm text-blue-700 underline"
        >
          {showAll ? '廃止済みを隠す' : '廃止済みも表示'}
        </Link>
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-gray-500">この種類のボトルはまだありません</p>
      ) : (
        groups.map((g) => (
          <section key={g.key} className="space-y-1">
            <h3 className={`text-sm font-bold ${g.key === UNCATEGORIZED ? 'text-amber-800' : 'text-gray-600'}`}>
              {g.label}（{g.drinks.length}）
            </h3>
            <ul className="divide-y rounded border bg-white">
              {g.drinks.map((d) => (
                <DrinkRow key={d.id} drink={d} isAdmin={isAdmin} categories={categories} />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
