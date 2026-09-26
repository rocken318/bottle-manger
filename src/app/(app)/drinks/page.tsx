import Link from 'next/link';
import { requireStaff } from '@/lib/auth/current';
import { getDb } from '@/lib/db/client';
import { listDrinks } from '@/lib/repo/drinks';
import { DrinkActiveToggle } from './DrinkActiveToggle';
import { DrinkCreateForm } from './DrinkCreateForm';

export default async function DrinksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await requireStaff();
  const showAll = (await searchParams).all === '1';
  const drinks = await listDrinks(getDb(), { includeInactive: showAll });
  const isAdmin = staff.role === 'admin';

  return (
    <div className="space-y-4">
      <DrinkCreateForm />
      <div className="flex items-center justify-between">
        <h2 className="font-bold">ドリンク一覧</h2>
        <Link href={showAll ? '/drinks' : '/drinks?all=1'} className="text-sm text-blue-700 underline">
          {showAll ? '廃止済みを隠す' : '廃止済みも表示'}
        </Link>
      </div>
      <ul className="divide-y rounded border bg-white">
        {drinks.map((d) => (
          <li key={d.id} className="flex items-center justify-between px-3 py-3">
            <span className={d.isActive ? '' : 'text-gray-400 line-through'}>
              {d.name}
              <span className="ml-2 text-xs text-gray-500">1ケース{d.unitsPerCase}本</span>
            </span>
            {isAdmin && <DrinkActiveToggle id={d.id} isActive={d.isActive} />}
          </li>
        ))}
      </ul>
    </div>
  );
}
