import { createPostgresDb } from '../src/lib/db/postgres';
import { createStaff } from '../src/lib/repo/staff';
import { toUserMessage } from '../src/lib/errors';

const [name, pin, homeLocationName] = process.argv.slice(2);
if (!name || !pin) {
  console.error('usage: npm run db:create-admin -- <名前> <PIN(4〜6桁)> [所属拠点名]');
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set (.env.local を確認してください)');
  process.exit(1);
}

const db = createPostgresDb(url);
let homeLocationId: string | null = null;
if (homeLocationName) {
  const rows = await db.query<{ id: string }>(
    'select id from locations where name = $1 and is_active',
    [homeLocationName],
  );
  if (!rows[0]) {
    console.error(`拠点が見つかりません: ${homeLocationName}`);
    process.exit(1);
  }
  homeLocationId = rows[0].id;
}
// Note: the PIN passed here appears in shell history. Change it from the admin screen afterwards.
try {
  // The first account becomes the master; later ones are plain admins.
  const [{ hasMaster }] = await db.query<{ hasMaster: boolean }>(
    `select exists(select 1 from staff where role = 'master' and is_active) as "hasMaster"`,
  );
  const role = hasMaster ? 'admin' : 'master';
  const staff = await createStaff(db, null, { name, pin, role, homeLocationId });
  console.log(`created ${role}: ${staff.name} (${staff.id})`);
  process.exit(0);
} catch (e) {
  console.error(toUserMessage(e));
  process.exit(1);
}
