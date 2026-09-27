import { z } from 'zod';
import { parseMoneyInput } from './costs/money';
import { isValidYmd } from './dates';
import type { MovementInput } from './types';

const uuid = z.uuid('不正な ID です');
const quantity = z
  .number()
  .int('本数は整数で入力してください')
  .min(1, '本数は1本以上にしてください')
  .max(100000, '本数が大きすぎます');
const name = z.string().trim().min(1, '名前を入力してください').max(50, '名前は50文字以内にしてください');

export const pinSchema = z.string().regex(/^\d{4,6}$/, 'PINは4〜6桁の数字にしてください');
export const roleSchema = z.enum(['master', 'admin', 'staff']);
export const idSchema = uuid;

// The units per case the client used to turn cases into bottles; the server rejects the batch
// if it no longer matches the drink (it was edited while the entry page was open).
const unitsPerCase = z.number().int('1ケースの本数が正しくありません').min(1, '1ケースの本数が正しくありません');

export const disposeReasonSchema = z.enum(['breakage', 'tasting', 'expired', 'other'], '廃棄の理由を選んでください');

export const movementItemSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('receive'), drinkId: uuid, unitsPerCase, toLocationId: uuid, quantity }),
  z.object({ type: z.literal('sale'), drinkId: uuid, unitsPerCase, fromLocationId: uuid, quantity }),
  z.object({
    type: z.literal('dispose'),
    drinkId: uuid,
    unitsPerCase,
    fromLocationId: uuid,
    quantity,
    reason: disposeReasonSchema,
  }),
  z.object({
    type: z.literal('transfer'),
    drinkId: uuid,
    unitsPerCase,
    fromLocationId: uuid,
    toLocationId: uuid,
    quantity,
  }),
  z.object({
    type: z.literal('adjust'),
    drinkId: uuid,
    unitsPerCase,
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
    items: z.array(movementItemSchema).min(1, 'ボトルを選んでください').max(500, '一度に登録できるのは500件までです'),
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
    reason: item.type === 'dispose' ? item.reason : null,
    note: note ? note : null,
  };
}

export const loginSchema = z.object({ staffId: uuid, pin: pinSchema });

export const changePinSchema = z
  .object({ currentPin: pinSchema, newPin: pinSchema, confirmPin: z.string() })
  .refine((v) => v.newPin === v.confirmPin, { message: '新しいPINが一致しません', path: ['confirmPin'] });

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

// --- v1.2 原価・棚卸差異 ---

/** Upper bound for a typed price (per bottle or per case), in yen. */
export const MAX_PRICE_YEN = 10_000_000;

export const priceCreateSchema = z
  .object({
    drinkId: uuid,
    effectiveFrom: z
      .string()
      .refine(isValidYmd, '適用開始日を正しく入力してください')
      .refine((s) => s >= '2000-01-01' && s <= '2099-12-31', '適用開始日を正しく入力してください'),
    mode: z.enum(['unit', 'case'], '単価の種類が正しくありません'),
    amount: z.string(),
  })
  .transform((v, ctx) => {
    const amountCents = parseMoneyInput(v.amount);
    if (amountCents === null) {
      ctx.addIssue({ code: 'custom', path: ['amount'], message: '金額は0以上の数字（小数は2桁まで）で入力してください' });
      return z.NEVER;
    }
    if (amountCents > MAX_PRICE_YEN * 100) {
      ctx.addIssue({ code: 'custom', path: ['amount'], message: '金額が大きすぎます' });
      return z.NEVER;
    }
    return { drinkId: v.drinkId, effectiveFrom: v.effectiveFrom, mode: v.mode, amountCents };
  });
export type PriceCreateInput = z.infer<typeof priceCreateSchema>;

/** Non-negative decimal text (maxDecimals: 0 = whole numbers only, otherwise up to 2 decimals). */
const decimalText = (label: string, maxDecimals: 0 | 2) =>
  z
    .string()
    .trim()
    .regex(
      maxDecimals === 0 ? /^\d+$/ : /^\d+(\.\d{1,2})?$/,
      maxDecimals === 0 ? `${label}は0以上の整数で入力してください` : `${label}は0以上の数字で入力してください`,
    )
    .transform(Number);

export const costSettingsSchema = z.object({
  taxRate: decimalText('税率', 2).pipe(z.number().min(0).max(100, '税率は0〜100%にしてください')),
  varianceQtyThreshold: decimalText('本数の基準', 0).pipe(z.number().max(1_000_000, '本数の基準が大きすぎます')),
  varianceAmountThreshold: decimalText('金額の基準', 0).pipe(z.number().max(1_000_000_000, '金額の基準が大きすぎます')),
});
export type CostSettingsInput = z.infer<typeof costSettingsSchema>;
