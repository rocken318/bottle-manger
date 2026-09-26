import { describe, expect, it } from 'vitest';
import {
  changePinSchema,
  drinkUpdateSchema,
  entrySchema,
  locationSchema,
  locationUpdateSchema,
  staffCreateSchema,
  toMovementInput,
} from '@/lib/validation';

const a = '0b8f5c1e-1f4a-4c1e-9d2a-2b3c4d5e6f70';
const b = '1b8f5c1e-1f4a-4c1e-9d2a-2b3c4d5e6f71';
const drink = '2b8f5c1e-1f4a-4c1e-9d2a-2b3c4d5e6f72';

describe('entrySchema', () => {
  it('accepts a transfer between two locations', () => {
    const r = entrySchema.safeParse({
      batchId: a,
      confirmNegative: false,
      items: [{ type: 'transfer', drinkId: drink, unitsPerCase: 24, fromLocationId: a, toLocationId: b, quantity: 5 }],
    });
    expect(r.success).toBe(true);
  });
  it('rejects a transfer to the same location', () => {
    const r = entrySchema.safeParse({
      batchId: a,
      confirmNegative: false,
      items: [{ type: 'transfer', drinkId: drink, unitsPerCase: 24, fromLocationId: a, toLocationId: a, quantity: 5 }],
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe('移動元と移動先が同じです');
  });
  it('rejects zero quantity', () => {
    const r = entrySchema.safeParse({
      batchId: a,
      confirmNegative: false,
      items: [{ type: 'sale', drinkId: drink, unitsPerCase: 24, fromLocationId: a, quantity: 0 }],
    });
    expect(r.success).toBe(false);
  });
  it('accepts a stocktake count of zero', () => {
    const r = entrySchema.safeParse({
      batchId: a,
      confirmNegative: false,
      items: [{ type: 'adjust', drinkId: drink, unitsPerCase: 24, toLocationId: a, countedQuantity: 0 }],
    });
    expect(r.success).toBe(true);
  });
  it('rejects an empty batch', () => {
    expect(entrySchema.safeParse({ batchId: a, confirmNegative: false, items: [] }).success).toBe(false);
  });
  it('accepts up to 500 items and rejects more', () => {
    const item = { type: 'sale', drinkId: drink, unitsPerCase: 24, fromLocationId: a, quantity: 1 };
    expect(
      entrySchema.safeParse({ batchId: a, confirmNegative: false, items: Array(500).fill(item) }).success,
    ).toBe(true);
    const r = entrySchema.safeParse({ batchId: a, confirmNegative: false, items: Array(501).fill(item) });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe('一度に登録できるのは500件までです');
  });
  it('requires a positive integer unitsPerCase on each item', () => {
    for (const unitsPerCase of [undefined, 0, 1.5]) {
      const r = entrySchema.safeParse({
        batchId: a,
        confirmNegative: false,
        items: [{ type: 'sale', drinkId: drink, unitsPerCase, fromLocationId: a, quantity: 1 }],
      });
      expect(r.success).toBe(false);
    }
  });
  it('rejects an absurdly large quantity', () => {
    const r = entrySchema.safeParse({
      batchId: a,
      confirmNegative: false,
      items: [{ type: 'sale', drinkId: drink, unitsPerCase: 24, fromLocationId: a, quantity: 100001 }],
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe('本数が大きすぎます');
  });
  it('rejects an absurdly large counted quantity', () => {
    const r = entrySchema.safeParse({
      batchId: a,
      confirmNegative: false,
      items: [{ type: 'adjust', drinkId: drink, unitsPerCase: 24, toLocationId: a, countedQuantity: 100001 }],
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe('本数が大きすぎます');
  });
});

describe('toMovementInput', () => {
  it('fills in nulls and the shared note', () => {
    expect(toMovementInput({ type: 'sale', drinkId: drink, unitsPerCase: 24, fromLocationId: a, quantity: 2 }, '営業後')).toEqual({
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

describe('locationUpdateSchema', () => {
  it('accepts a valid id, name, sortOrder and isActive', () => {
    const r = locationUpdateSchema.safeParse({ id: a, name: '倉庫', sortOrder: 1, isActive: true });
    expect(r.success).toBe(true);
  });
  it('rejects a non-uuid id', () => {
    const r = locationUpdateSchema.safeParse({ id: 'not-a-uuid', name: '倉庫', sortOrder: 1, isActive: true });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe('不正な ID です');
  });
  it('rejects a missing isActive', () => {
    const r = locationUpdateSchema.safeParse({ id: a, name: '倉庫', sortOrder: 1 });
    expect(r.success).toBe(false);
  });
});

describe('drinkUpdateSchema', () => {
  it('accepts an id, a name and units per case', () => {
    const r = drinkUpdateSchema.safeParse({ id: a, name: ' コーラ500 ', unitsPerCase: '12' });
    expect(r.success).toBe(true);
    expect(r.data).toEqual({ id: a, name: 'コーラ500', unitsPerCase: 12 });
  });
  it('rejects a missing id', () => {
    expect(drinkUpdateSchema.safeParse({ id: 'x', name: 'コーラ', unitsPerCase: 24 }).success).toBe(false);
  });
});

describe('changePinSchema', () => {
  it('accepts matching new PINs', () => {
    expect(changePinSchema.safeParse({ currentPin: '1234', newPin: '2468', confirmPin: '2468' }).success).toBe(true);
  });
  it('rejects a confirmation that does not match', () => {
    const r = changePinSchema.safeParse({ currentPin: '1234', newPin: '2468', confirmPin: '2469' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]).toMatchObject({ message: '新しいPINが一致しません', path: ['confirmPin'] });
  });
  it('rejects a badly formatted PIN', () => {
    const r = changePinSchema.safeParse({ currentPin: '1234', newPin: '12', confirmPin: '12' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe('PINは4〜6桁の数字にしてください');
  });
});
