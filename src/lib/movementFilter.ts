import { isValidYmd } from './dates';
import type { MovementType } from './types';

export interface MovementFilter {
  locationId?: string;
  drinkId?: string;
  staffId?: string;
  type?: MovementType;
  fromDate?: string;
  toDate?: string;
}

type Params = Record<string, string | string[] | undefined>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPES: MovementType[] = ['receive', 'sale', 'transfer', 'adjust'];

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function parseMovementFilter(params: Params): MovementFilter {
  const f: MovementFilter = {};
  const location = first(params.location);
  const drink = first(params.drink);
  const staff = first(params.staff);
  const type = first(params.type);
  const from = first(params.from);
  const to = first(params.to);
  if (location && UUID_PATTERN.test(location)) f.locationId = location;
  if (drink && UUID_PATTERN.test(drink)) f.drinkId = drink;
  if (staff && UUID_PATTERN.test(staff)) f.staffId = staff;
  if (type && (TYPES as string[]).includes(type)) f.type = type as MovementType;
  if (from && isValidYmd(from)) f.fromDate = from;
  if (to && isValidYmd(to)) f.toDate = to;
  return f;
}

export function movementFilterToQuery(f: MovementFilter): string {
  const q = new URLSearchParams();
  if (f.locationId) q.set('location', f.locationId);
  if (f.drinkId) q.set('drink', f.drinkId);
  if (f.staffId) q.set('staff', f.staffId);
  if (f.type) q.set('type', f.type);
  if (f.fromDate) q.set('from', f.fromDate);
  if (f.toDate) q.set('to', f.toDate);
  return q.toString();
}
