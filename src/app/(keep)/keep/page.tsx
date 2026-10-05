import { requireStaff } from '@/lib/auth/current';
import { getDb } from '@/lib/db/client';
import { todayJst } from '@/lib/keep';
import { listKeepBottles } from '@/lib/repo/keepBottles';
import { KeepList } from './KeepList';

export default async function KeepPage() {
  // レイアウトは画面遷移のたびには再実行されず、ページ単体のデータ取得も止めない。ページ自身でも確かめる。
  await requireStaff();
  const db = getDb();
  const [active, dropped] = await Promise.all([listKeepBottles(db, 'active'), listKeepBottles(db, 'dropped')]);
  return <KeepList active={active} dropped={dropped} today={todayJst()} />;
}
