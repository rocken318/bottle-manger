import { describe, expect, it } from 'vitest';
import {
  MAX_MONTHS,
  costFilterToQuery,
  jstMonth,
  jstToday,
  monthsBetween,
  nextMonth,
  parseCostFilter,
} from '@/lib/costs/period';

const loc = '0b8f5c1e-1f4a-4c1e-9d2a-2b3c4d5e6f70';
const now = new Date('2026-03-31T15:30:00Z'); // 2026-04-01 00:30 JST

describe('JST helpers', () => {
  it('uses the Japan calendar day and month', () => {
    expect(jstToday(now)).toBe('2026-04-01');
    expect(jstMonth(now)).toBe('2026-04');
    expect(jstMonth(new Date('2026-03-31T14:59:59Z'))).toBe('2026-03');
  });
  it('steps months across year ends', () => {
    expect(nextMonth('2026-12')).toBe('2027-01');
    expect(monthsBetween('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(monthsBetween('2026-02', '2026-02')).toEqual(['2026-02']);
  });
});

describe('parseCostFilter', () => {
  it('defaults to the current JST month and all locations', () => {
    expect(parseCostFilter({}, now)).toEqual({ filter: { fromMonth: '2026-04', toMonth: '2026-04' }, notice: null });
  });
  it('reads valid months and a location', () => {
    expect(parseCostFilter({ from: '2026-01', to: '2026-03', location: loc }, now).filter).toEqual({
      fromMonth: '2026-01',
      toMonth: '2026-03',
      locationId: loc,
    });
  });
  it('ignores invalid values', () => {
    expect(parseCostFilter({ from: '2026-13', to: 'x', location: 'nope' }, now).filter).toEqual({
      fromMonth: '2026-04',
      toMonth: '2026-04',
    });
  });
  it('fills a missing end with the start month', () => {
    expect(parseCostFilter({ from: '2026-01' }, now).filter).toMatchObject({ fromMonth: '2026-01', toMonth: '2026-01' });
  });
  it('swaps a reversed range', () => {
    const r = parseCostFilter({ from: '2026-03', to: '2026-01' }, now);
    expect(r.filter).toMatchObject({ fromMonth: '2026-01', toMonth: '2026-03' });
    expect(r.notice).toMatch(/入れ替え/);
  });
  it('limits the range length', () => {
    const r = parseCostFilter({ from: '2020-01', to: '2026-03' }, now);
    expect(monthsBetween(r.filter.fromMonth, r.filter.toMonth)).toHaveLength(MAX_MONTHS);
    expect(r.filter.toMonth).toBe('2026-03');
    expect(r.notice).toMatch(/最大/);
  });
  it('round-trips through a query string', () => {
    const f = { fromMonth: '2026-01', toMonth: '2026-03', locationId: loc };
    const q = costFilterToQuery(f);
    expect(parseCostFilter(Object.fromEntries(new URLSearchParams(q)), now).filter).toEqual(f);
  });
});
