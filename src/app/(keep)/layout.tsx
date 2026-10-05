import Link from 'next/link';
import { requireStaff } from '@/lib/auth/current';
import { logoutAction } from '../login/actions';
import { KeepNav } from './KeepNav';

export default async function KeepLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff();
  return (
    <div className="mx-auto min-h-dvh max-w-4xl pb-20">
      <header className="flex items-center justify-between gap-3 border-b bg-white px-4 py-2 text-sm">
        <span className="min-w-0 truncate font-bold">遊栄キープボトル管理</span>
        <div className="flex shrink-0 items-center gap-3">
          <Link href="/" className="text-blue-700 underline">
            在庫管理へ
          </Link>
          <span className="max-w-[8rem] truncate">{staff.name}</span>
          <form action={logoutAction}>
            <button className="text-blue-600 underline">ログアウト</button>
          </form>
        </div>
      </header>
      <main className="px-4 py-4">{children}</main>
      <KeepNav />
    </div>
  );
}
