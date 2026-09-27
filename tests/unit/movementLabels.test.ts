import { describe, expect, it } from 'vitest';
import { describeMovement } from '@/lib/movementLabels';

const base = { fromLocationName: null, toLocationName: null, countedQuantity: null, unitsPerCase: 24 };

describe('describeMovement', () => {
  it('describes each movement type', () => {
    expect(describeMovement({ ...base, type: 'receive', toLocationName: '事務所', quantity: 48 })).toBe(
      '事務所に入荷 2ケース（計48本）',
    );
    expect(describeMovement({ ...base, type: 'sale', fromLocationName: 'Kingyo', quantity: 3 })).toBe(
      'Kingyoで販売 3本',
    );
    expect(
      describeMovement({ ...base, type: 'transfer', fromLocationName: '事務所', toLocationName: 'En', quantity: 5 }),
    ).toBe('事務所 → En 5本');
    expect(
      describeMovement({ ...base, type: 'adjust', toLocationName: '暖家', quantity: -3, countedQuantity: 7 }),
    ).toBe('暖家で棚卸 実数7本（差 −3本）');
    expect(
      describeMovement({ ...base, type: 'adjust', toLocationName: '暖家', quantity: 2, countedQuantity: 9 }),
    ).toBe('暖家で棚卸 実数9本（差 +2本）');
  });
});

describe('describeMovement for 破損・廃棄', () => {
  it('shows the location, quantity and reason', () => {
    expect(
      describeMovement({
        type: 'dispose',
        fromLocationName: 'Kingyo',
        toLocationName: null,
        quantity: 2,
        countedQuantity: null,
        unitsPerCase: 24,
        reason: 'breakage',
      }),
    ).toBe('Kingyoで廃棄 2本（破損）');
  });
});
