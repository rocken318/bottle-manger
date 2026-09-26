import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import type { TestProject } from 'vitest/node';
import { runMigrations } from '../src/lib/db/migrate';
import { wrapPglite } from '../src/lib/db/pglite';

declare module 'vitest' {
  export interface ProvidedContext {
    pgliteSnapshot: string;
  }
}

export default async function setup(project: TestProject) {
  const pg = new PGlite();
  await runMigrations(wrapPglite(pg));
  const dump = await pg.dumpDataDir('none');
  await pg.close();
  const file = path.join(await mkdtemp(path.join(os.tmpdir(), 'pglite-')), 'migrated.tar');
  await writeFile(file, Buffer.from(await dump.arrayBuffer()));
  project.provide('pgliteSnapshot', file);
}
