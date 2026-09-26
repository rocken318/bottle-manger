import { describe, expect, it } from 'vitest';
import { entrySchema, locationSchema, staffCreateSchema, toMovementInput } from '@/lib/validation';

const a = '0b8f5c1e-1f4a-4c1e-9d2a-2b3c4d5e6f70';
const b = '1b8f5c1e-1f4a-4c1e-9d2a-2b3c4d5e6f71';
const drink = '2b8f5c1e-1f4a-4c1e-9d2a-2b3c4d5e6f72';

describe('entrySchema', () => {
  it('accepts a transfer between two locations', () => {
    const r = entrySchema.safeParse({
      batchId: a,
      confirmNegative: false,
      items: [{ type: 'transfer', drinkId: drink, fromLocationId: a, toLocationId: b, quantity: 5 }],
    });
    expect(r.success).toBe(true);
  });
  it('rejects a transfer to the same location', () => {
    const r = entrySchema.safeParse({
      batchId: a,
      confirmNegative: false,
      items: [{ type: 'transfer', drinkId: drink, fromLocationId: a, toLocationId: a, quantity: 5 }],
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe('移動元と移動先が同じです');
  });
  it('rejects zero quantity', () => {
    const r = entrySchema.safeParse({
      batchId: a,
      confirmNegative: false,
      items: [{ type: 'sale', drinkId: drink, fromLocationId: a, quantity: 0 }],
    });
    expect(r.success).toBe(false);
  });
  it('accepts a stocktake count of zero', () => {
    const r = entrySchema.safeParse({
      batchId: a,
      confirmNegative: false,
      items: [{ type: 'adjust', drinkId: drink, toLocationId: a, countedQuantity: 0 }],
    });
    expect(r.success).toBe(true);
  });
  it('rejects an empty batch', () => {
    expect(entrySchema.safeParse({ batchId: a, confirmNegative: false, items: [] }).success).toBe(false);
  });
  it('rejects an absurdly large quantity', () => {
    const r = entrySchema.safeParse({
      batchId: a,
      confirmNegative: false,
      items: [{ type: 'sale', drinkId: drink, fromLocationId: a, quantity: 100001 }],
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe('本数が大きすぎます');
  });
  it('rejects an absurdly large counted quantity', () => {
    const r = entrySchema.safeParse({
      batchId: a,
      confirmNegative: false,
      items: [{ type: 'adjust', drinkId: drink, toLocationId: a, countedQuantity: 100001 }],
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe('本数が大きすぎます');
  });
});

describe('toMovementInput', () => {
  it('fills in nulls and the shared note', () => {
    expect(toMovementInput({ type: 'sale', drinkId: drink, fromLocationId: a, quantity: 2 }, '営業後')).toEqual({
      type: 'sale',
      drinkId: drink,
      fromLocationId: a,
      toLocationId: null,
      quantity: 2,
      countedQuantity: null,
      note: '営業後',
    });
  });
});

describe('staffCreateSchema', () => {
  it('requires a 4-6 digit PIN', () => {
    expect(staffCreateSchema.safeParse({ name: '花子', pin: '12a4', role: 'staff', homeLocationId: null }).success).toBe(
      false,
    );
    expect(staffCreateSchema.safeParse({ name: '花子', pin: '1234', role: 'staff', homeLocationId: null }).success).toBe(
      true,
    );
  });
});

describe('locationSchema', () => {
  it('gives a Japanese message for a negative sortOrder', () => {
    const r = locationSchema.safeParse({ name: '倉庫', sortOrder: -1 });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe('表示順は0以上にしてください');
  });
  it('gives a Japanese message for a sortOrder above 999', () => {
    const r = locationSchema.safeParse({ name: '倉庫', sortOrder: 1000 });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe('表示順は999以下にしてください');
  });
});
