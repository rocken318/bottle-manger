import { createPostgresDb } from '../src/lib/db/postgres';
import { runMigrations } from '../src/lib/db/migrate';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set (.env.local を確認してください)');
  process.exit(1);
}

const ran = await runMigrations(createPostgresDb(url));
console.log(ran.length ? `applied: ${ran.join(', ')}` : 'already up to date');
process.exit(0);
