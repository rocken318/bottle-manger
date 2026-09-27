import { formatQuantity } from './quantity';
import type { DisposeReason, Movement, MovementType } from './types';

export const MOVEMENT_TYPE_LABELS: Record<MovementType, string> = {
  receive: '入荷',
  sale: '販売',
  transfer: '移動',
  adjust: '棚卸',
  dispose: '破損・廃棄',
};

export const DISPOSE_REASON_LABELS: Record<DisposeReason, string> = {
  breakage: '破損',
  tasting: '試飲・サービス',
  expired: '期限切れ',
  other: 'その他',
};

function signed(n: number): string {
  if (n > 0) return `+${n}`;
  if (n < 0) return `−${-n}`;
  return '±0';
}

export function describeMovement(
  m: Pick<Movement, 'type' | 'fromLocationName' | 'toLocationName' | 'quantity' | 'countedQuantity' | 'unitsPerCase'> & {
    reason?: DisposeReason | null;
  },
): string {
  const qty = formatQuantity(m.quantity, m.unitsPerCase);
  switch (m.type) {
    case 'receive':
      return `${m.toLocationName}に入荷 ${qty}`;
    case 'sale':
      return `${m.fromLocationName}で販売 ${qty}`;
    case 'transfer':
      return `${m.fromLocationName} → ${m.toLocationName} ${qty}`;
    case 'dispose':
      return `${m.fromLocationName}で廃棄 ${qty}（${m.reason ? DISPOSE_REASON_LABELS[m.reason] : '理由なし'}）`;
    case 'adjust':
      return `${m.toLocationName}で棚卸 実数${formatQuantity(m.countedQuantity ?? 0, m.unitsPerCase)}（差 ${signed(m.quantity)}本）`;
  }
}
