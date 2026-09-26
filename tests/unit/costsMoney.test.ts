import { describe, expect, it } from 'vitest';
import {
  casePriceToUnitCents,
  centsToYen,
  formatCents,
  formatYen,
  lineAmountYen,
  parseCents,
  parseMoneyInput,
  taxYen,
} from '@/lib/costs/money';

describe('parseCents', () => {
  it('parses numeric strings as returned by the database', () => {
    expect(parseCents('123.45')).toBe(12345);
    expect(parseCents('100')).toBe(10000);
    expect(parseCents('0.5')).toBe(50);
    expect(parseCents('-12.50')).toBe(-1250);
    expect(parseCents('1234.5600')).toBe(123456);
  });
  it('accepts numbers', () => {
    expect(parseCents(83.33)).toBe(8333);
    expect(parseCents(0)).toBe(0);
  });
  it('rejects garbage', () => {
    expect(() => parseCents('abc')).toThrow();
    expect(() => parseCents('1.234')).toThrow();
  });
});

describe('centsToYen (half up, away from zero)', () => {
  it('rounds positive amounts', () => {
    expect(centsToYen(12349)).toBe(123);
    expect(centsToYen(12350)).toBe(124);
    expect(centsToYen(12300)).toBe(123);
  });
  it('rounds negative amounts symmetrically', () => {
    expect(centsToYen(-12350)).toBe(-124);
    expect(centsToYen(-12349)).toBe(-123);
  });
  it('never returns negative zero', () => {
    expect(Object.is(centsToYen(-10), 0)).toBe(true);
  });
});

describe('lineAmountYen', () => {
  it('multiplies bottles by the unit cost then rounds once', () => {
    expect(lineAmountYen(3, 8333)).toBe(250); // 249.99
    expect(lineAmountYen(-2, 8325)).toBe(-167); // -166.5
  });
});

describe('taxYen', () => {
  it('truncates below one yen', () => {
    expect(taxYen(1009, 10)).toBe(100);
    expect(taxYen(1000, 8)).toBe(80);
    expect(taxYen(999, 8)).toBe(79);
    expect(taxYen(0, 10)).toBe(0);
    expect(taxYen(1000, 0)).toBe(0);
  });
  it('handles fractional rates without floating point drift', () => {
    expect(taxYen(1000, 8.5)).toBe(85);
    expect(taxYen(3333, 10)).toBe(333);
  });
});

describe('casePriceToUnitCents', () => {
  it('divides by the units per case and rounds to 2 decimals (half up)', () => {
    expect(casePriceToUnitCents(240000, 24)).toBe(10000);
    expect(casePriceToUnitCents(200000, 24)).toBe(8333); // 83.3333
    expect(casePriceToUnitCents(100, 8)).toBe(13); // 0.125 -> 0.13
    expect(casePriceToUnitCents(100, 3)).toBe(33);
  });
});

describe('parseMoneyInput', () => {
  it('accepts yen with up to 2 decimals and thousands separators', () => {
    expect(parseMoneyInput('120')).toBe(12000);
    expect(parseMoneyInput('83.33')).toBe(8333);
    expect(parseMoneyInput(' 1,234.5 ')).toBe(123450);
    expect(parseMoneyInput('０')).toBe(0);
    expect(parseMoneyInput('１２０')).toBe(12000);
  });
  it('rejects invalid input', () => {
    expect(parseMoneyInput('')).toBeNull();
    expect(parseMoneyInput('-1')).toBeNull();
    expect(parseMoneyInput('1.234')).toBeNull();
    expect(parseMoneyInput('1e3')).toBeNull();
    expect(parseMoneyInput('abc')).toBeNull();
  });
});

describe('formatting', () => {
  it('formats cents as a plain decimal string', () => {
    expect(formatCents(8333)).toBe('83.33');
    expect(formatCents(10000)).toBe('100.00');
    expect(formatCents(5)).toBe('0.05');
    expect(formatCents(-150)).toBe('-1.50');
  });
  it('formats yen with separators', () => {
    expect(formatYen(1234567)).toBe('1,234,567');
    expect(formatYen(-1500)).toBe('-1,500');
  });
});
