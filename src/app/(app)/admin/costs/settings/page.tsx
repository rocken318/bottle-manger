import { requireAdmin } from '@/lib/auth/current';
import { getDb } from '@/lib/db/client';
import { getCostSettings } from '@/lib/repo/settings';
import { CostsNav } from '../CostsShared';
import { CostSettingsForm } from './SettingsForm';

export default async function CostsSettingsPage() {
  await requireAdmin();
  const settings = await getCostSettings(getDb());
  return (
    <div className="space-y-4">
      <CostsNav current="settings" />
      <CostSettingsForm settings={settings} />
      <p className="text-xs text-gray-600">
        消費税率は仕入の消費税・税込金額の計算に使います（1円未満切り捨て）。変更はすべての期間の表示に反映されます。
      </p>
    </div>
  );
}
