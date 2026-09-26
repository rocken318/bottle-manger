import { describe, expect, it } from 'vitest';
import { formatDateTime, jstDayStart, jstNextDayStart } from '@/lib/dates';

describe('dates', () => {
  it('formats in Japan time', () => {
    expect(formatDateTime(new Date('2026-09-26T05:05:00Z'))).toBe('2026/09/26 14:05');
  });
  it('computes JST day boundaries', () => {
    expect(jstDayStart('2026-09-26').toISOString()).toBe('2026-09-25T15:00:00.000Z');
    expect(jstNextDayStart('2026-09-26').toISOString()).toBe('2026-09-26T15:00:00.000Z');
  });
});
