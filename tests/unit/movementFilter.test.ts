import { describe, expect, it } from 'vitest';
import { movementFilterToQuery, parseMovementFilter } from '@/lib/movementFilter';

const id = '0b8f5c1e-1f4a-4c1e-9d2a-2b3c4d5e6f70';

describe('parseMovementFilter', () => {
  it('keeps valid values', () => {
    expect(
      parseMovementFilter({ location: id, drink: id, staff: id, type: 'sale', from: '2026-09-01', to: '2026-09-30' }),
    ).toEqual({ locationId: id, drinkId: id, staffId: id, type: 'sale', fromDate: '2026-09-01', toDate: '2026-09-30' });
  });
  it('drops invalid values', () => {
    expect(parseMovementFilter({ location: 'x', type: 'steal', from: '9/1' })).toEqual({});
  });
  it('takes the first value of repeated params', () => {
    expect(parseMovementFilter({ type: ['sale', 'receive'] })).toEqual({ type: 'sale' });
  });
});

describe('movementFilterToQuery', () => {
  it('round-trips', () => {
    const f = { drinkId: id, type: 'sale' as const };
    expect(parseMovementFilter(Object.fromEntries(new URLSearchParams(movementFilterToQuery(f))))).toEqual(f);
  });
});
