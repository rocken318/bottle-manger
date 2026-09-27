import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { runMigrations } from '../src/lib/db/migrate';
import { wrapPglite } from '../src/lib/db/pglite';
import { createStaff } from '../src/lib/repo/staff';

const PORT = Number(process.env.E2E_DB_PORT ?? 55432);

const pg = await PGlite.create();
const db = wrapPglite(pg);
await runMigrations(db);
const [office] = await db.query<{ id: string }>(`select id from locations where name = '事務所'`);
await createStaff(db, null, { name: '管理者', pin: '1234', role: 'master', homeLocationId: office.id });

const server = new PGLiteSocketServer({ db: pg, port: PORT, host: '127.0.0.1' });
await server.start();
console.log(`e2e db ready on ${PORT}`);
