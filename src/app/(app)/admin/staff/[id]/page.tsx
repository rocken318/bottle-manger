import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/current';
import { getDb } from '@/lib/db/client';
import { listLocations } from '@/lib/repo/locations';
import { getStaffById } from '@/lib/repo/staff';
import { idSchema } from '@/lib/validation';
import { StaffEditForms } from './StaffEditForms';

export default async function StaffEditPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
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
      <StaffEditForms staff={staff} locations={locations} isLocked={isLocked} />
    </div>
  );
}
