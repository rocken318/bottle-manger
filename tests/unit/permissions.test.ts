import { describe, expect, it } from 'vitest';
import { canAssignRole, canEditStaff, canResetPin, canVoid, isAdminRole } from '@/lib/permissions';

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

describe('staff management permissions', () => {
  it('treats masters as admins', () => {
    expect(isAdminRole('master')).toBe(true);
    expect(isAdminRole('admin')).toBe(true);
    expect(isAdminRole('staff')).toBe(false);
    expect(canVoid({ staffId: 'x', createdAt: hoursAgo(1000), voidedAt: null }, { id: 'm', role: 'master' }, now)).toBe(true);
  });
  it('lets only masters assign the admin and master roles', () => {
    expect(canAssignRole('master', 'master')).toBe(true);
    expect(canAssignRole('master', 'admin')).toBe(true);
    expect(canAssignRole('admin', 'staff')).toBe(true);
    expect(canAssignRole('admin', 'admin')).toBe(false);
    expect(canAssignRole('admin', 'master')).toBe(false);
    expect(canAssignRole('staff', 'staff')).toBe(false);
  });
  it('lets admins edit only staff (and themselves)', () => {
    expect(canEditStaff('admin', 'staff', false)).toBe(true);
    expect(canEditStaff('admin', 'admin', false)).toBe(false);
    expect(canEditStaff('admin', 'master', false)).toBe(false);
    expect(canEditStaff('admin', 'admin', true)).toBe(true);
    expect(canEditStaff('master', 'admin', false)).toBe(true);
    expect(canEditStaff('master', 'master', false)).toBe(true);
  });
  it("never allows setting a master's PIN, and admins only set staff PINs", () => {
    expect(canResetPin('admin', 'staff')).toBe(true);
    expect(canResetPin('admin', 'admin')).toBe(false);
    expect(canResetPin('master', 'admin')).toBe(true);
    expect(canResetPin('master', 'staff')).toBe(true);
    expect(canResetPin('master', 'master')).toBe(false);
    expect(canResetPin('admin', 'master')).toBe(false);
  });
});
