import { formatQuantity } from './quantity';
import type { Movement, MovementType } from './types';

export const MOVEMENT_TYPE_LABELS: Record<MovementType, string> = {
  receive: '入荷',
  sale: '販売',
  transfer: '移動',
  adjust: '棚卸',
};

function signed(n: number): string {
  if (n > 0) return `+${n}`;
  if (n < 0) return `−${-n}`;
  return '±0';
}

export function describeMovement(
  m: Pick<Movement, 'type' | 'fromLocationName' | 'toLocationName' | 'quantity' | 'countedQuantity' | 'unitsPerCase'>,
): string {
  const qty = formatQuantity(m.quantity, m.unitsPerCase);
  switch (m.type) {
    case 'receive':
      return `${m.toLocationName}に入荷 ${qty}`;
    case 'sale':
      return `${m.fromLocationName}で販売 ${qty}`;
    case 'transfer':
      return `${m.fromLocationName} → ${m.toLocationName} ${qty}`;
    case 'adjust':
      return `${m.toLocationName}で棚卸 実数${formatQuantity(m.countedQuantity ?? 0, m.unitsPerCase)}（差 ${signed(m.quantity)}本）`;
  }
}
