import { matchesSearch } from './search';

/** キープの期限。最終利用日からこの日数。 */
export const KEEP_EXPIRY_DAYS = 180;
/** 一覧上部のバナーを出す「期限まであと◯日以内」。 */
export const KEEP_WARN_DAYS = 30;

const jstDateParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** 日本時間の今日（YYYY-MM-DD）。 */
export function todayJst(now: Date = new Date()): string {
  return jstDateParts.format(now);
}

const DAY_MS = 24 * 60 * 60 * 1000;

function ymdToUtcMs(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** 期限までの残り日数。0 は期限の当日、負は超過。 */
export function daysRemaining(lastUsedOn: string, today: string): number {
  const elapsed = Math.round((ymdToUtcMs(today) - ymdToUtcMs(lastUsedOn)) / DAY_MS);
  return KEEP_EXPIRY_DAYS - elapsed;
}

export function expiryLabel(remaining: number): string {
  return remaining >= 0 ? `あと${remaining}日` : `${-remaining}日超過`;
}

/** 0 日以下は赤く表示する。 */
export function isExpired(remaining: number): boolean {
  return remaining <= 0;
}

/** 期限まで KEEP_WARN_DAYS 日以内（超過を含む）のキープ中ボトルの数。 */
export function countNearExpiry(bottles: { lastUsedOn: string }[], today: string): number {
  return bottles.filter((b) => daysRemaining(b.lastUsedOn, today) <= KEEP_WARN_DAYS).length;
}

export function filterByCustomer<T extends { customerName: string }>(bottles: T[], query: string): T[] {
  return bottles.filter((b) => matchesSearch(b.customerName, query));
}
