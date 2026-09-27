import Link from 'next/link';
import { requireStaff } from '@/lib/auth/current';
import { getDb } from '@/lib/db/client';
import { listDrinks } from '@/lib/repo/drinks';
import { DrinkCreateForm } from './DrinkCreateForm';
import { DrinkRow } from './DrinkRow';
import { isAdminRole } from '@/lib/permissions';

export default async function DrinksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await requireStaff();
  const showAll = (await searchParams).all === '1';
  const drinks = await listDrinks(getDb(), { includeInactive: showAll });
  const isAdmin = isAdminRole(staff.role);

  return (
    <div className="space-y-4">
      <DrinkCreateForm />
      <div className="flex items-center justify-between">
        <h2 className="font-bold">ボトル一覧</h2>
        <Link href={showAll ? '/drinks' : '/drinks?all=1'} className="text-sm text-blue-700 underline">
          {showAll ? '廃止済みを隠す' : '廃止済みも表示'}
        </Link>
      </div>
      <ul className="divide-y rounded border bg-white">
        {drinks.map((d) => (
          <DrinkRow key={d.id} drink={d} isAdmin={isAdmin} />
        ))}
      </ul>
    </div>
  );
}
