import { requireStaff } from '@/lib/auth/current';
import { ChangePinForm } from './ChangePinForm';

const ROLE_LABELS = { admin: '管理者', staff: 'スタッフ' } as const;

export default async function AccountPage() {
  const staff = await requireStaff();
  return (
    <div className="space-y-4">
      <section className="rounded border bg-white p-4">
        <h2 className="mb-2 font-bold">アカウント</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-gray-600">名前</dt>
          <dd className="break-all">{staff.name}</dd>
          <dt className="text-gray-600">権限</dt>
          <dd>{ROLE_LABELS[staff.role]}</dd>
        </dl>
      </section>
      <ChangePinForm />
    </div>
  );
}
