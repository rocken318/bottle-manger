import { getDb } from '@/lib/db/client';
import { todayJst } from '@/lib/keep';
import { listKeepBottles } from '@/lib/repo/keepBottles';
import { KeepList } from './KeepList';

export default async function KeepPage() {
  // 認証は (keep)/layout.tsx の requireStaff() で済んでいる。
  const db = getDb();
  const [active, dropped] = await Promise.all([listKeepBottles(db, 'active'), listKeepBottles(db, 'dropped')]);
  return <KeepList active={active} dropped={dropped} today={todayJst()} />;
}
