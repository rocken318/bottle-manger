import { requireStaff } from '@/lib/auth/current';
import { ChangePinForm } from './ChangePinForm';
import { ROLE_LABELS } from '@/lib/permissions';
import { PageHelp } from '../PageHelp';

export default async function AccountPage() {
  const staff = await requireStaff();
  return (
    <div className="space-y-4">
      <PageHelp>
        <ul>
          <li>自分の名前と権限（スタッフ・管理者・マスター）を確認できます。</li>
          <li>PINを変えるときは、今のPINと新しいPIN（2回）を入れて「PINを変更」を押します。</li>
          <li>PINは4〜6桁の数字です。今と同じPINにはできません。</li>
          <li>PINを5回まちがえると、15分間ロックされてログインできなくなります。</li>
          <li>PINを忘れたときやロックされたときは、管理者に連絡してください（PINの再設定・ロック解除ができます）。</li>
        </ul>
      </PageHelp>
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
