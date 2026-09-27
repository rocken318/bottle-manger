import { redirect } from 'next/navigation';
import { getCurrentStaff } from '@/lib/auth/current';
import { getDb } from '@/lib/db/client';
import { listLoginNames } from '@/lib/repo/staff';
import { LoginForm } from './LoginForm';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if (await getCurrentStaff()) redirect('/');
  const names = await listLoginNames(getDb());
  return (
    <main className="mx-auto max-w-sm px-4 py-12">
      <h1 className="mb-6 text-center text-xl font-bold">遊栄ボトル在庫管理システム</h1>
      <LoginForm names={names} />
    </main>
  );
}
