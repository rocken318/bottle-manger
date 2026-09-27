// Developer tool for staff accounts: anything the admin screens can do, for anyone (including masters).
// Every change goes through the same repository functions, so it is validated and logged in
// audit_logs with 「システム」 as the actor.
import { createPostgresDb } from '../src/lib/db/postgres';
import { toUserMessage } from '../src/lib/errors';
import { ROLE_LABELS } from '../src/lib/permissions';
import { getStaffById, listStaff, resetPin, unlockStaff, updateStaff } from '../src/lib/repo/staff';
import type { Staff } from '../src/lib/types';
import { pinSchema, roleSchema } from '../src/lib/validation';

const USAGE = `usage: npm run db:staff -- <command> ...
  list                          全員の名前・権限・所属・状態
  role   <名前> <master|admin|staff>
  pin    <名前> <新しいPIN>      ロックも解除（後で本人にアカウント画面で変えてもらう）
  rename <名前> <新しい名前>
  home   <名前> <拠点名|なし>
  active <名前> <on|off>
  unlock <名前>`;

const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};

const url = process.env.DATABASE_URL ?? fail('DATABASE_URL is not set (.env.local を確認してください)');
const db = createPostgresDb(url);
const [command, name, value] = process.argv.slice(2);

/** Prefers the active account; an inactive one is only used when it is the only match. */
async function findStaff(staffName: string | undefined): Promise<Staff> {
  if (!staffName) return fail(USAGE);
  const matches = (await listStaff(db)).filter((s) => s.name === staffName);
  const active = matches.filter((s) => s.isActive);
  if (active.length === 1) return active[0];
  if (matches.length === 1) return matches[0];
  return fail(matches.length === 0 ? `スタッフが見つかりません: ${staffName}` : `同じ名前が複数います: ${staffName}`);
}

async function update(staff: Staff, change: Partial<Pick<Staff, 'name' | 'role' | 'homeLocationId' | 'isActive'>>) {
  await updateStaff(db, null, { ...staff, ...change });
  const after = await getStaffById(db, staff.id);
  console.log(`${staff.name}: 変更しました →`, after && describe(after));
}

const locationNames = new Map(
  (await db.query<{ id: string; name: string }>('select id, name from locations')).map((l) => [l.id, l.name]),
);
const describe = (s: Staff) =>
  `${s.name}（${ROLE_LABELS[s.role]}・${s.homeLocationId ? locationNames.get(s.homeLocationId) : '所属なし'}` +
  `${s.isActive ? '' : '・無効'}${s.lockedUntil && s.lockedUntil.getTime() > Date.now() ? '・ロック中' : ''}）`;

try {
  switch (command) {
    case 'list':
      for (const s of await listStaff(db)) console.log(describe(s));
      break;
    case 'role': {
      const role = roleSchema.safeParse(value);
      if (!role.success) fail(USAGE);
      await update(await findStaff(name), { role: role.data });
      break;
    }
    case 'pin': {
      const pin = pinSchema.safeParse(value);
      if (!pin.success) fail('PINは4〜6桁の数字にしてください');
      const staff = await findStaff(name);
      await resetPin(db, null, staff.id, pin.data!);
      console.log(`${staff.name}: PINを変更し、ロックを解除しました`);
      break;
    }
    case 'rename':
      if (!value?.trim()) fail(USAGE);
      await update(await findStaff(name), { name: value.trim() });
      break;
    case 'home': {
      if (!value) fail(USAGE);
      const homeLocationId =
        value === 'なし' ? null : ([...locationNames].find(([, n]) => n === value)?.[0] ?? fail(`拠点が見つかりません: ${value}`));
      await update(await findStaff(name), { homeLocationId });
      break;
    }
    case 'active':
      if (value !== 'on' && value !== 'off') fail(USAGE);
      await update(await findStaff(name), { isActive: value === 'on' });
      break;
    case 'unlock': {
      const staff = await findStaff(name);
      await unlockStaff(db, null, staff.id);
      console.log(`${staff.name}: ロックを解除しました`);
      break;
    }
    default:
      fail(USAGE);
  }
  process.exit(0);
} catch (e) {
  fail(toUserMessage(e));
}
