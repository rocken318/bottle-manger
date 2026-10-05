import { describe, expect, it } from 'vitest';
import {
  KEEP_EXPIRY_DAYS,
  countNearExpiry,
  daysRemaining,
  expiryLabel,
  filterByCustomer,
  isExpired,
  todayJst,
} from '@/lib/keep';

describe('keep', () => {
  it('expires after 180 days', () => {
    expect(KEEP_EXPIRY_DAYS).toBe(180);
  });

  it('takes "today" in Japan time, across the UTC midnight', () => {
    // 2026-10-05 15:30 UTC は日本ではもう 10/06 の 0:30
    expect(todayJst(new Date('2026-10-05T15:30:00Z'))).toBe('2026-10-06');
    expect(todayJst(new Date('2026-10-05T14:59:00Z'))).toBe('2026-10-05');
  });

  it('counts remaining days, with day 180 still valid and day 181 over', () => {
    expect(daysRemaining('2026-10-05', '2026-10-05')).toBe(180);
    expect(daysRemaining('2026-10-01', '2026-10-05')).toBe(176); // 経過 4 日
    // 最終利用日から 180 日目 = あと0日、181 日目 = 1日超過
    expect(daysRemaining('2026-01-01', '2026-06-30')).toBe(0);
    expect(daysRemaining('2026-01-01', '2026-07-01')).toBe(-1);
  });

  it('labels remaining and overdue days', () => {
    expect(expiryLabel(12)).toBe('あと12日');
    expect(expiryLabel(0)).toBe('あと0日');
    expect(expiryLabel(-3)).toBe('3日超過');
  });

  it('marks 0 days or less as expired', () => {
    expect(isExpired(1)).toBe(false);
    expect(isExpired(0)).toBe(true);
    expect(isExpired(-5)).toBe(true);
  });

  it('counts bottles within 30 days of expiry, overdue ones included', () => {
    const today = '2026-10-05';
    const bottles = [
      { lastUsedOn: '2026-10-05' }, // 残り 180
      { lastUsedOn: '2026-05-09' }, // 経過 149 → 残り 31
      { lastUsedOn: '2026-05-08' }, // 経過 150 → 残り 30
      { lastUsedOn: '2025-01-01' }, // 超過
    ];
    expect(countNearExpiry(bottles, today)).toBe(2);
  });

  it('finds customers regardless of width, kana type and spaces', () => {
    const rows = [{ customerName: 'タナカ ヒロシ' }, { customerName: '佐藤' }];
    expect(filterByCustomer(rows, 'たなか')).toEqual([rows[0]]);
    expect(filterByCustomer(rows, 'ﾀﾅｶ')).toEqual([rows[0]]);
    expect(filterByCustomer(rows, 'ひろし')).toEqual([rows[0]]);
    expect(filterByCustomer(rows, '  ')).toEqual(rows);
    expect(filterByCustomer(rows, 'ほげ')).toEqual([]);
  });
});
