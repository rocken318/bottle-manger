import { describe, expect, it } from 'vitest';
import { costSettingsSchema, priceCreateSchema } from '@/lib/validation';

const drink = '2b8f5c1e-1f4a-4c1e-9d2a-2b3c4d5e6f72';

describe('priceCreateSchema', () => {
  const base = { drinkId: drink, effectiveFrom: '2026-04-01', mode: 'unit', amount: '83.33' };
  it('parses a unit price into cents', () => {
    expect(priceCreateSchema.parse(base)).toEqual({
      drinkId: drink,
      effectiveFrom: '2026-04-01',
      mode: 'unit',
      amountCents: 8333,
    });
  });
  it('accepts a case price', () => {
    expect(priceCreateSchema.parse({ ...base, mode: 'case', amount: '2,000' })).toMatchObject({
      mode: 'case',
      amountCents: 200000,
    });
  });
  it('rejects bad amounts', () => {
    for (const amount of ['', '-1', '1.234', 'abc', '10000001']) {
      expect(priceCreateSchema.safeParse({ ...base, amount }).success, amount).toBe(false);
    }
  });
  it('rejects bad dates, modes and ids', () => {
    expect(priceCreateSchema.safeParse({ ...base, effectiveFrom: '2026-02-30' }).success).toBe(false);
    expect(priceCreateSchema.safeParse({ ...base, effectiveFrom: '1999-12-31' }).success).toBe(false);
    expect(priceCreateSchema.safeParse({ ...base, mode: 'box' }).success).toBe(false);
    expect(priceCreateSchema.safeParse({ ...base, drinkId: 'x' }).success).toBe(false);
  });
});

describe('costSettingsSchema', () => {
  const base = { taxRate: '10', varianceQtyThreshold: '5', varianceAmountThreshold: '3000' };
  it('parses numbers', () => {
    expect(costSettingsSchema.parse(base)).toEqual({
      taxRate: 10,
      varianceQtyThreshold: 5,
      varianceAmountThreshold: 3000,
    });
    expect(costSettingsSchema.parse({ ...base, taxRate: '8.5', varianceQtyThreshold: '0' })).toMatchObject({
      taxRate: 8.5,
      varianceQtyThreshold: 0,
    });
  });
  it('keeps the tax rate within 0-100', () => {
    expect(costSettingsSchema.safeParse({ ...base, taxRate: '0' }).success).toBe(true);
    expect(costSettingsSchema.safeParse({ ...base, taxRate: '100' }).success).toBe(true);
    expect(costSettingsSchema.safeParse({ ...base, taxRate: '100.01' }).success).toBe(false);
    expect(costSettingsSchema.safeParse({ ...base, taxRate: '-1' }).success).toBe(false);
    expect(costSettingsSchema.safeParse({ ...base, taxRate: '' }).success).toBe(false);
    expect(costSettingsSchema.safeParse({ ...base, taxRate: '1e1' }).success).toBe(false);
  });
  it('requires non-negative whole-number thresholds', () => {
    expect(costSettingsSchema.safeParse({ ...base, varianceQtyThreshold: '-1' }).success).toBe(false);
    expect(costSettingsSchema.safeParse({ ...base, varianceQtyThreshold: '1.5' }).success).toBe(false);
    expect(costSettingsSchema.safeParse({ ...base, varianceAmountThreshold: '-100' }).success).toBe(false);
    expect(costSettingsSchema.safeParse({ ...base, varianceAmountThreshold: '' }).success).toBe(false);
  });
});
