import { z } from 'zod';
import type { MovementInput } from './types';

const uuid = z.uuid('不正な ID です');
const quantity = z
  .number()
  .int('本数は整数で入力してください')
  .min(1, '本数は1本以上にしてください')
  .max(100000, '本数が大きすぎます');
const name = z.string().trim().min(1, '名前を入力してください').max(50, '名前は50文字以内にしてください');

export const pinSchema = z.string().regex(/^\d{4,6}$/, 'PINは4〜6桁の数字にしてください');
export const roleSchema = z.enum(['admin', 'staff']);
export const idSchema = uuid;

export const movementItemSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('receive'), drinkId: uuid, toLocationId: uuid, quantity }),
  z.object({ type: z.literal('sale'), drinkId: uuid, fromLocationId: uuid, quantity }),
  z.object({ type: z.literal('transfer'), drinkId: uuid, fromLocationId: uuid, toLocationId: uuid, quantity }),
  z.object({
    type: z.literal('adjust'),
    drinkId: uuid,
    toLocationId: uuid,
    countedQuantity: z
      .number()
      .int('本数は整数で入力してください')
      .min(0, '本数は0本以上にしてください')
      .max(100000, '本数が大きすぎます'),
  }),
]);
export type MovementItem = z.infer<typeof movementItemSchema>;

export const entrySchema = z
  .object({
    batchId: uuid,
    confirmNegative: z.boolean(),
    note: z.string().trim().max(200, 'メモは200文字以内にしてください').optional(),
    items: z.array(movementItemSchema).min(1, 'ドリンクを選んでください').max(500, '一度に登録できるのは500件までです'),
  })
  .superRefine((value, ctx) => {
    value.items.forEach((item, i) => {
      if (item.type === 'transfer' && item.fromLocationId === item.toLocationId) {
        ctx.addIssue({ code: 'custom', path: ['items', i], message: '移動元と移動先が同じです' });
      }
    });
  });

export function toMovementInput(item: MovementItem, note?: string): MovementInput {
  return {
    type: item.type,
    drinkId: item.drinkId,
    fromLocationId: 'fromLocationId' in item ? item.fromLocationId : null,
    toLocationId: 'toLocationId' in item ? item.toLocationId : null,
    quantity: 'quantity' in item ? item.quantity : 0,
    countedQuantity: item.type === 'adjust' ? item.countedQuantity : null,
    note: note ? note : null,
  };
}

export const loginSchema = z.object({ staffId: uuid, pin: pinSchema });

export const staffCreateSchema = z.object({
  name,
  pin: pinSchema,
  role: roleSchema,
  homeLocationId: uuid.nullable(),
});

export const staffUpdateSchema = z.object({
  id: uuid,
  name,
  role: roleSchema,
  homeLocationId: uuid.nullable(),
  isActive: z.boolean(),
});

export const drinkCreateSchema = z.object({
  name,
  unitsPerCase: z.coerce
    .number()
    .int('1ケースの本数は整数で入力してください')
    .min(1, '1ケースの本数は1以上にしてください')
    .max(1000, '1ケースの本数が大きすぎます'),
});

export const drinkUpdateSchema = drinkCreateSchema.extend({ id: idSchema });

export const locationSchema = z.object({
  name,
  sortOrder: z.coerce
    .number()
    .int('表示順は整数で入力してください')
    .min(0, '表示順は0以上にしてください')
    .max(999, '表示順は999以下にしてください'),
});

export const locationUpdateSchema = locationSchema.extend({ id: uuid, isActive: z.boolean() });
