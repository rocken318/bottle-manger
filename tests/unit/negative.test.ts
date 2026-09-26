import { describe, expect, it } from 'vitest';
import { findNegativeResults } from '@/lib/repo/stock';
import type { MovementInput } from '@/lib/types';

const item = (p: Partial<MovementInput>): MovementInput => ({
  type: 'sale',
  drinkId: 'd',
  fromLocationId: null,
  toLocationId: null,
  quantity: 0,
  countedQuantity: null,
  note: null,
  ...p,
});

describe('findNegativeResults', () => {
  it('reports locations that would go below zero', () => {
    const levels = [{ locationId: 'L1', drinkId: 'd', quantity: 3 }];
    expect(findNegativeResults(levels, [item({ fromLocationId: 'L1', quantity: 5 })])).toEqual([
      { locationId: 'L1', drinkId: 'd', resulting: -2 },
    ]);
  });
  it('accounts for earlier items in the same batch', () => {
    const items = [
      item({ type: 'receive', toLocationId: 'L1', quantity: 5 }),
      item({ fromLocationId: 'L1', quantity: 5 }),
    ];
    expect(findNegativeResults([], items)).toEqual([]);
  });
  it('treats a stocktake as an absolute count', () => {
    const items = [
      item({ type: 'adjust', toLocationId: 'L1', countedQuantity: 1 }),
      item({ fromLocationId: 'L1', quantity: 2 }),
    ];
    expect(findNegativeResults([{ locationId: 'L1', drinkId: 'd', quantity: 50 }], items)).toEqual([
      { locationId: 'L1', drinkId: 'd', resulting: -1 },
    ]);
  });
  it('ignores locations that only receive stock', () => {
    const items = [item({ type: 'transfer', fromLocationId: 'L1', toLocationId: 'L2', quantity: 1 })];
    expect(findNegativeResults([{ locationId: 'L1', drinkId: 'd', quantity: 1 }], items)).toEqual([]);
  });
});
