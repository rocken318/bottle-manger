import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/current';
import { canEditStaff, canResetPin } from '@/lib/permissions';
import { getDb } from '@/lib/db/client';
import { listLocations } from '@/lib/repo/locations';
import { getStaffById } from '@/lib/repo/staff';
import { idSchema } from '@/lib/validation';
import { StaffEditForms } from './StaffEditForms';
import { PageHelp } from '../../../PageHelp';

export default async function StaffEditPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireAdmin();
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  const db = getDb();
  const [staff, allLocations] = await Promise.all([
    getStaffById(db, id),
    listLocations(db, { includeInactive: true }),
  ]);
  if (!staff) notFound();
  const locations = allLocations.filter((l) => l.isActive || l.id === staff.homeLocationId);
  const isLocked = staff.lockedUntil !== null && staff.lockedUntil.getTime() > Date.now();
  return (
    <div className="space-y-4">
      <Link href="/admin/staff" className="text-sm text-blue-700 underline">
        ← スタッフ一覧
      </Link>
      <h1 className="text-lg font-bold">{staff.name}</h1>
      <PageHelp>
        <ul>
          <li>名前・権限・所属拠点を変えたら「保存」を押します。</li>
          <li>「有効」のチェックを外すと、その人はログインできなくなります（記録は残ります）。</li>
          <li>PINを忘れた人には「新しいPIN」を入れて「PINを変更」を押し、新しいPINを本人に伝えます。ロックも解除されます。</li>
          <li>PINを5回まちがえてロックされた人は「ロックを解除」ですぐに使えるようにできます（何もしなくても15分で解除されます）。</li>
          <li>管理者が変更・PIN再設定・ロック解除できるのは「スタッフ」の人だけです。管理者・マスターの人はマスターが変更します。</li>
          <li>自分の権限は変えられません。自分のPINは右上の名前（アカウント画面）から変更します。</li>
          <li>マスターのPINはこの画面では変えられません。本人がアカウント画面で変更し、忘れたときは開発担当者に連絡してください。</li>
        </ul>
      </PageHelp>
      {canEditStaff(viewer.role, staff.role, viewer.id === staff.id) ? (
        <StaffEditForms
          staff={staff}
          locations={locations}
          isLocked={isLocked}
          viewerRole={viewer.role}
          isSelf={viewer.id === staff.id}
          canSetPin={canResetPin(viewer.role, staff.role) && viewer.id !== staff.id}
        />
      ) : (
        <p className="rounded border bg-white p-4 text-sm text-gray-700">
          管理者・マスターの情報やPINを変更できるのはマスターだけです。
        </p>
      )}
    </div>
  );
}
