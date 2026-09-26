const dateTimeFormat = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

export const YMD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** True only for strings shaped like YYYY-MM-DD that are also real calendar dates. */
export function isValidYmd(s: string): boolean {
  if (!YMD_PATTERN.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function formatDateTime(date: Date): string {
  return dateTimeFormat.format(date);
}

/** Start of the given JST calendar day (YYYY-MM-DD). */
export function jstDayStart(ymd: string): Date {
  return new Date(`${ymd}T00:00:00+09:00`);
}

export function jstNextDayStart(ymd: string): Date {
  return new Date(jstDayStart(ymd).getTime() + 24 * 60 * 60 * 1000);
}
