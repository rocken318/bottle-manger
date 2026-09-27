import { requireAdmin } from '@/lib/auth/current';
import { getDb } from '@/lib/db/client';
import { getCostSettings } from '@/lib/repo/settings';
import { CostsNav } from '../CostsShared';
import { CostSettingsForm } from './SettingsForm';
import { PageHelp } from '../../../PageHelp';

export default async function CostsSettingsPage() {
  await requireAdmin();
  const settings = await getCostSettings(getDb());
  return (
    <div className="space-y-4">
      <CostsNav current="settings" />
      <PageHelp>
        <ul>
          <li>消費税率：仕入の消費税と税込金額の計算に使います。税率が変わったときだけ変更してください。</li>
          <li>変更すると、過去の月も含めて全部の期間の表示が新しい税率になります。</li>
          <li>棚卸差異を強調する基準：差異の本数か金額のどちらかが基準以上の棚卸は、「棚卸差異」の明細で赤く「要確認」と表示されます。</li>
          <li>数字を変えたら「保存」を押します。</li>
        </ul>
      </PageHelp>
      <CostSettingsForm settings={settings} />
      <p className="text-xs text-gray-600">
        消費税率は仕入の消費税・税込金額の計算に使います（1円未満切り捨て）。変更はすべての期間の表示に反映されます。
      </p>
    </div>
  );
}
