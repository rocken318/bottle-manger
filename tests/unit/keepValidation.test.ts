import { describe, expect, it } from 'vitest';
import { keepCreateSchema, keepNoteSchema } from '@/lib/validation';

const valid = {
  customerName: ' 田中様 ',
  drinkId: '6f1c2b0e-8f6a-4b8e-9d51-3f2d8c1a7e10',
  registeredOn: '2026-10-05',
  note: '',
};

describe('keep validation', () => {
  it('accepts a valid input and trims the name', () => {
    const r = keepCreateSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.customerName).toBe('田中様');
  });

  it('requires a customer name and a drink', () => {
    expect(keepCreateSchema.safeParse({ ...valid, customerName: '   ' }).error?.issues[0].message).toBe('お客様名を入力してください');
    expect(keepCreateSchema.safeParse({ ...valid, drinkId: '' }).error?.issues[0].message).toBe('お酒を選んでください');
  });

  it('limits the name to 50 and the note to 500 characters', () => {
    expect(keepCreateSchema.safeParse({ ...valid, customerName: 'あ'.repeat(51) }).success).toBe(false);
    expect(keepCreateSchema.safeParse({ ...valid, note: 'あ'.repeat(500) }).success).toBe(true);
    expect(keepCreateSchema.safeParse({ ...valid, note: 'あ'.repeat(501) }).error?.issues[0].message).toBe('メモは500文字以内にしてください');
    expect(keepNoteSchema.safeParse({ id: valid.drinkId, note: 'あ'.repeat(501) }).success).toBe(false);
  });

  it('rejects dates that are not real calendar days', () => {
    expect(keepCreateSchema.safeParse({ ...valid, registeredOn: '2026-02-30' }).success).toBe(false);
    expect(keepCreateSchema.safeParse({ ...valid, registeredOn: '' }).success).toBe(false);
  });
});
