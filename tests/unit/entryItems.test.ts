import { describe, expect, it } from 'vitest';
import { buildEntryItems } from '@/lib/entryItems';
import type { Drink } from '@/lib/types';

const loc = '0b8f5c1e-1f4a-4c1e-9d2a-2b3c4d5e6f70';
const dest = '1b8f5c1e-1f4a-4c1e-9d2a-2b3c4d5e6f71';
const drink = (id: string, name: string, unitsPerCase = 24): Drink => ({
  id,
  name,
  unitsPerCase,
  isActive: true,
  createdAt: new Date(0),
});
const cola = drink('c0000000-0000-4000-8000-000000000001', 'コーラ');
const beer = drink('c0000000-0000-4000-8000-000000000002', 'ビール', 12);
const drinks = [cola, beer];

describe('buildEntryItems', () => {
  it('builds receive items only for filled rows', () => {
    const r = buildEntryItems({
      type: 'receive',
      locationId: loc,
      destinationId: dest,
      drinks,
      quantities: { [cola.id]: { cases: '2', bottles: '3' }, [beer.id]: { cases: '', bottles: ' ' } },
    });
    expect(r).toEqual({ items: [{ type: 'receive', drinkId: cola.id, toLocationId: loc, quantity: 51 }] });
  });

  it('builds sale and transfer items', () => {
    expect(
      buildEntryItems({
        type: 'sale',
        locationId: loc,
        destinationId: dest,
        drinks,
        quantities: { [beer.id]: { cases: '1', bottles: '' } },
      }),
    ).toEqual({ items: [{ type: 'sale', drinkId: beer.id, fromLocationId: loc, quantity: 12 }] });
    expect(
      buildEntryItems({
        type: 'transfer',
        locationId: loc,
        destinationId: dest,
        drinks,
        quantities: { [cola.id]: { cases: '', bottles: '5' }, [beer.id]: { cases: '0', bottles: '1' } },
      }),
    ).toEqual({
      items: [
        { type: 'transfer', drinkId: cola.id, fromLocationId: loc, toLocationId: dest, quantity: 5 },
        { type: 'transfer', drinkId: beer.id, fromLocationId: loc, toLocationId: dest, quantity: 1 },
      ],
    });
  });

  it('allows a stocktake count of zero', () => {
    expect(
      buildEntryItems({
        type: 'adjust',
        locationId: loc,
        destinationId: dest,
        drinks,
        quantities: { [cola.id]: { cases: '0', bottles: '' } },
      }),
    ).toEqual({ items: [{ type: 'adjust', drinkId: cola.id, toLocationId: loc, countedQuantity: 0 }] });
  });

  it('rejects a filled row totaling zero for receive/sale/transfer', () => {
    for (const type of ['receive', 'sale', 'transfer'] as const) {
      expect(
        buildEntryItems({
          type,
          locationId: loc,
          destinationId: dest,
          drinks,
          quantities: { [cola.id]: { cases: '0', bottles: '0' } },
        }),
      ).toEqual({ error: 'コーラの数量を入力してください' });
    }
  });

  it('rejects negative or non-integer quantities', () => {
    for (const q of [
      { cases: '-1', bottles: '' },
      { cases: '', bottles: '1.5' },
      { cases: 'abc', bottles: '' },
    ]) {
      expect(
        buildEntryItems({ type: 'adjust', locationId: loc, destinationId: dest, drinks, quantities: { [beer.id]: q } }),
      ).toEqual({ error: 'ビールの数量が正しくありません' });
    }
  });

  it('requires at least one filled row', () => {
    expect(
      buildEntryItems({
        type: 'receive',
        locationId: loc,
        destinationId: dest,
        drinks,
        quantities: { [cola.id]: { cases: ' ', bottles: '' } },
      }),
    ).toEqual({ error: 'ドリンクの数量を入力してください' });
    expect(buildEntryItems({ type: 'receive', locationId: loc, destinationId: dest, drinks, quantities: {} })).toEqual({
      error: 'ドリンクの数量を入力してください',
    });
  });

  it('ignores quantities for drinks that are not in the list', () => {
    expect(
      buildEntryItems({
        type: 'receive',
        locationId: loc,
        destinationId: dest,
        drinks: [cola],
        quantities: { [beer.id]: { cases: '1', bottles: '' } },
      }),
    ).toEqual({ error: 'ドリンクの数量を入力してください' });
  });

  it('rejects a transfer to the same location or without a destination', () => {
    const quantities = { [cola.id]: { cases: '1', bottles: '' } };
    expect(buildEntryItems({ type: 'transfer', locationId: loc, destinationId: loc, drinks, quantities })).toEqual({
      error: '移動元と移動先が同じです',
    });
    expect(buildEntryItems({ type: 'transfer', locationId: loc, destinationId: '', drinks, quantities })).toEqual({
      error: '移動先の拠点がありません',
    });
  });
});
