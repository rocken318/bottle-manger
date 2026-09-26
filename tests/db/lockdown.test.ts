import { describe, expect, it } from 'vitest';
import { createTestDb } from '../helpers/testDb';

describe('lockdown', () => {
  it('enables row level security on every table', async () => {
    const db = await createTestDb();
    const rows = await db.query<{ relname: string }>(
      `select relname from pg_class
       where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity`,
    );
    expect(rows).toEqual([]);
  });
});
