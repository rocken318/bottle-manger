import { describe, expect, it } from 'vitest';
import { formatQuantity, splitCases, toBottles } from '@/lib/quantity';

describe('toBottles', () => {
  it('combines cases and bottles', () => {
    expect(toBottles(3, 5, 24)).toBe(77);
  });
});

describe('splitCases', () => {
  it('splits a total into cases and loose bottles', () => {
    expect(splitCases(77, 24)).toEqual({ cases: 3, bottles: 5 });
  });
});

describe('formatQuantity', () => {
  it('shows cases, bottles and total', () => {
    expect(formatQuantity(77, 24)).toBe('3ケース＋5本（計77本）');
  });
  it('omits bottles when the cases are full', () => {
    expect(formatQuantity(48, 24)).toBe('2ケース（計48本）');
  });
  it('shows only bottles below one case', () => {
    expect(formatQuantity(5, 24)).toBe('5本');
    expect(formatQuantity(0, 24)).toBe('0本');
  });
  it('shows only bottles when a case holds one', () => {
    expect(formatQuantity(7, 1)).toBe('7本');
  });
  it('shows negative stock as a total', () => {
    expect(formatQuantity(-5, 24)).toBe('計−5本');
  });
});
