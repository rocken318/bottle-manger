import Link from 'next/link';
import { requireStaff } from '@/lib/auth/current';
import { logoutAction } from '../login/actions';
import { BottomNav } from './BottomNav';
import { isAdminRole } from '@/lib/permissions';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff();
  return (
    <div className="mx-auto min-h-dvh max-w-4xl pb-20">
      <header className="flex items-center justify-between gap-3 border-b bg-white px-4 py-2 text-sm">
        <span className="min-w-0 truncate font-bold">遊栄ボトル在庫管理システム</span>
        <div className="flex shrink-0 items-center gap-3">
          <Link href="/account" className="max-w-[8rem] truncate text-blue-700 underline" title="アカウント・PIN変更">
            {staff.name}
          </Link>
          <form action={logoutAction}>
            <button className="text-blue-600 underline">ログアウト</button>
          </form>
        </div>
      </header>
      <main className="px-4 py-4">{children}</main>
      <BottomNav isAdmin={isAdminRole(staff.role)} />
    </div>
  );
}
