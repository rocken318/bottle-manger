// Developer tool: change someone's role (e.g. make the first master). Logged in audit_logs as the system.
import { createPostgresDb } from '../src/lib/db/postgres';
import { toUserMessage } from '../src/lib/errors';
import { getStaffById, updateStaff } from '../src/lib/repo/staff';
import { roleSchema } from '../src/lib/validation';
import { activeStaffIdByName, requireDatabaseUrl } from './staffByName';

const [name, roleArg] = process.argv.slice(2);
const role = roleSchema.safeParse(roleArg);
if (!name || !role.success) {
  console.error('usage: npm run db:set-role -- <名前> <master|admin|staff>');
  process.exit(1);
}
const db = createPostgresDb(requireDatabaseUrl());
try {
  const staff = await getStaffById(db, await activeStaffIdByName(db, name));
  if (!staff) throw new Error('staff_not_found');
  await updateStaff(db, null, { ...staff, role: role.data });
  console.log(`${staff.name}: ${staff.role} → ${role.data}`);
  process.exit(0);
} catch (e) {
  console.error(toUserMessage(e));
  process.exit(1);
}
