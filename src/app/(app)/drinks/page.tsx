import Link from 'next/link';
import { requireStaff } from '@/lib/auth/current';
import { getDb } from '@/lib/db/client';
import { listDrinks } from '@/lib/repo/drinks';
import { DrinkCreateForm } from './DrinkCreateForm';
import { DrinkRow } from './DrinkRow';
import { PageHelp } from '../PageHelp';
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
      <PageHelp>
        <ul>
          <li>新しいボトルは「ボトル名」と「1ケースの本数」を入れて「登録」を押します。</li>
          <li>1ケースの本数は、入力や在庫を「ケース＋本」で表示するのに使います。正しい数を入れてください。</li>
          <li>名前や1ケースの本数をまちがえたときは、一覧の「編集」から直せます。</li>
          <li>もう扱わないボトルは「廃止」にすると、入力や在庫一覧に出なくなります（管理者・マスターのみ）。</li>
          <li>廃止できるのは、全部の拠点で在庫が0本のときだけです。残っているときは棚卸などで0本にしてから廃止します。</li>
          <li>「廃止済みも表示」を押すと廃止したボトルも表示され、「復活」で元に戻せます。</li>
        </ul>
      </PageHelp>
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
