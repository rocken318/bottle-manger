import { describe, expect, it } from 'vitest';
import { canVoid } from '@/lib/permissions';

const now = new Date('2026-09-26T12:00:00Z');
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600 * 1000);
const staff = { id: 's1', role: 'staff' as const };
const admin = { id: 'a1', role: 'admin' as const };

describe('canVoid', () => {
  it('lets staff void their own movement within 24 hours', () => {
    expect(canVoid({ staffId: 's1', createdAt: hoursAgo(23), voidedAt: null }, staff, now)).toBe(true);
  });
  it('blocks staff after 24 hours', () => {
    expect(canVoid({ staffId: 's1', createdAt: hoursAgo(25), voidedAt: null }, staff, now)).toBe(false);
  });
  it("blocks staff from voiding someone else's movement", () => {
    expect(canVoid({ staffId: 'x', createdAt: hoursAgo(1), voidedAt: null }, staff, now)).toBe(false);
  });
  it('lets admins void anything not yet voided', () => {
    expect(canVoid({ staffId: 'x', createdAt: hoursAgo(1000), voidedAt: null }, admin, now)).toBe(true);
  });
  it('never allows voiding twice', () => {
    expect(canVoid({ staffId: 'a1', createdAt: hoursAgo(1), voidedAt: hoursAgo(0) }, admin, now)).toBe(false);
  });
});
