import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { getDb } from '../db/client';
import { getStaffById } from '../repo/staff';
import type { Staff } from '../types';
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, signSession, verifySession } from './session';

/** The logged-in staff member, re-read from the DB on every request so deactivation takes effect immediately. */
export const getCurrentStaff = cache(async (): Promise<Staff | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const staffId = await verifySession(token);
  if (!staffId) return null;
  const staff = await getStaffById(getDb(), staffId);
  return staff?.isActive ? staff : null;
});

export async function requireStaff(): Promise<Staff> {
  const staff = await getCurrentStaff();
  if (!staff) redirect('/login');
  return staff;
}

export async function requireAdmin(): Promise<Staff> {
  const staff = await requireStaff();
  if (staff.role !== 'admin') redirect('/');
  return staff;
}

export async function setSessionCookie(staffId: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, await signSession(staffId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}
