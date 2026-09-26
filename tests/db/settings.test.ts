import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/lib/db/types';
import { listAuditLogs } from '@/lib/repo/audit';
import { getCostSettings, updateCostSettings } from '@/lib/repo/settings';
import { createTestDb, insertStaff } from '../helpers/testDb';

let db: Db;
let adminId: string;

beforeEach(async () => {
  db = await createTestDb();
  adminId = await insertStaff(db, '管理者', 'admin');
});

describe('cost settings', () => {
  it('starts with the defaults from the migration', async () => {
    expect(await getCostSettings(db)).toEqual({ taxRate: 10, varianceQtyThreshold: 5, varianceAmountThreshold: 3000 });
  });

  it('updates the values and audits only what changed', async () => {
    await updateCostSettings(db, adminId, { taxRate: 8, varianceQtyThreshold: 5, varianceAmountThreshold: 1000 });
    expect(await getCostSettings(db)).toEqual({ taxRate: 8, varianceQtyThreshold: 5, varianceAmountThreshold: 1000 });

    const [log] = await listAuditLogs(db, 10);
    expect(log).toMatchObject({
      action: 'settings.update',
      staffName: '管理者',
      details: {
        before: { taxRate: 10, varianceAmountThreshold: 3000 },
        after: { taxRate: 8, varianceAmountThreshold: 1000 },
      },
    });

    const [row] = await db.query<{ updatedBy: string }>(
      `select updated_by as "updatedBy" from app_settings where key = 'tax_rate'`,
    );
    expect(row.updatedBy).toBe(adminId);
  });

  it('does nothing when nothing changed', async () => {
    await updateCostSettings(db, adminId, { taxRate: 10, varianceQtyThreshold: 5, varianceAmountThreshold: 3000 });
    expect(await listAuditLogs(db, 10)).toEqual([]);
  });

  it('keeps a fractional tax rate', async () => {
    await updateCostSettings(db, adminId, { taxRate: 8.5, varianceQtyThreshold: 0, varianceAmountThreshold: 0 });
    expect(await getCostSettings(db)).toEqual({ taxRate: 8.5, varianceQtyThreshold: 0, varianceAmountThreshold: 0 });
  });
});
