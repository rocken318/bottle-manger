import { describe, expect, it } from 'vitest';
import { describeAuditDetails } from '@/lib/auditDetails';

type Snap = { name: string; unitsPerCase: number };
const update = (before: Snap, after: Snap) => ({
  action: 'drink.update',
  details: { name: after.name, before, after },
});

describe('describeAuditDetails', () => {
  it('shows only the parts of a drink edit that changed', () => {
    expect(
      describeAuditDetails(update({ name: 'コーラ', unitsPerCase: 24 }, { name: 'コーラ500', unitsPerCase: 12 })),
    ).toBe('コーラ → コーラ500、24本/ケース → 12本/ケース');
    expect(
      describeAuditDetails(update({ name: 'コーラ', unitsPerCase: 24 }, { name: 'コーラ500', unitsPerCase: 24 })),
    ).toBe('コーラ → コーラ500');
    expect(
      describeAuditDetails(update({ name: 'コーラ', unitsPerCase: 24 }, { name: 'コーラ', unitsPerCase: 12 })),
    ).toBe('コーラ（24本/ケース → 12本/ケース）');
  });
  it('falls back to the name', () => {
    expect(describeAuditDetails({ action: 'drink.create', details: { name: 'コーラ' } })).toBe('コーラ');
    expect(describeAuditDetails({ action: 'drink.update', details: { name: 'コーラ' } })).toBe('コーラ');
    expect(describeAuditDetails({ action: 'login.locked', details: {} })).toBeNull();
  });
  it('describes price and settings changes', () => {
    expect(
      describeAuditDetails({
        action: 'price.create',
        details: { name: 'コーラ', effectiveFrom: '2026-09-01', unitCost: '83.33' },
      }),
    ).toBe('コーラ 2026-09-01から 1本83.33円');
    expect(
      describeAuditDetails({
        action: 'price.update',
        details: { name: 'コーラ', effectiveFrom: '2026-09-01', unitCost: '90.00', before: { unitCost: '83.33' } },
      }),
    ).toBe('コーラ 2026-09-01から 1本83.33円 → 90円');
    expect(
      describeAuditDetails({
        action: 'settings.update',
        details: { before: { taxRate: 10, varianceQtyThreshold: 5 }, after: { taxRate: 8, varianceQtyThreshold: 3 } },
      }),
    ).toBe('消費税率 10% → 8%、差異の本数 5本 → 3本');
  });
});
