import { describe, expect, it } from 'vitest';
import { formatDateTime, isValidYmd, jstDayStart, jstNextDayStart } from '@/lib/dates';

describe('dates', () => {
  it('formats in Japan time', () => {
    expect(formatDateTime(new Date('2026-09-26T05:05:00Z'))).toBe('2026/09/26 14:05');
  });
  it('computes JST day boundaries', () => {
    expect(jstDayStart('2026-09-26').toISOString()).toBe('2026-09-25T15:00:00.000Z');
    expect(jstNextDayStart('2026-09-26').toISOString()).toBe('2026-09-26T15:00:00.000Z');
  });
});

describe('isValidYmd', () => {
  it('accepts a real calendar date', () => {
    expect(isValidYmd('2026-02-28')).toBe(true);
  });
  it('rejects an impossible day of month', () => {
    expect(isValidYmd('2026-02-31')).toBe(false);
  });
  it('rejects an impossible month', () => {
    expect(isValidYmd('2026-99-99')).toBe(false);
  });
  it('rejects a value that does not match the YYYY-MM-DD shape', () => {
    expect(isValidYmd('26-1-1')).toBe(false);
  });
});
