// Developer tool: set anyone's PIN (the only way to reset a master's PIN). Logged in audit_logs as the system.
// The PIN appears in shell history, so have the person change it on the account page afterwards.
import { createPostgresDb } from '../src/lib/db/postgres';
import { toUserMessage } from '../src/lib/errors';
import { resetPin } from '../src/lib/repo/staff';
import { pinSchema } from '../src/lib/validation';
import { activeStaffIdByName, requireDatabaseUrl } from './staffByName';

const [name, pinArg] = process.argv.slice(2);
const pin = pinSchema.safeParse(pinArg);
if (!name || !pin.success) {
  console.error('usage: npm run db:reset-pin -- <名前> <新しいPIN(4〜6桁)>');
  process.exit(1);
}
const db = createPostgresDb(requireDatabaseUrl());
try {
  await resetPin(db, null, await activeStaffIdByName(db, name), pin.data);
  console.log(`${name} のPINを変更しました（ロックも解除）`);
  process.exit(0);
} catch (e) {
  console.error(toUserMessage(e));
  process.exit(1);
}
