import { describe, expect, it } from 'vitest';
import { toCsv } from '@/lib/csv';

describe('toCsv', () => {
  it('starts with a BOM and uses CRLF', () => {
    expect(toCsv(['a', 'b'], [[1, 'x']])).toBe('\uFEFFa,b\r\n1,x\r\n');
  });
  it('quotes commas, quotes and newlines', () => {
    expect(toCsv(['a'], [['x,"y"\nz']])).toBe('\uFEFFa\r\n"x,""y""\nz"\r\n');
  });
  it('writes null as empty', () => {
    expect(toCsv(['a', 'b'], [[null, 2]])).toBe('\uFEFFa,b\r\n,2\r\n');
  });
  it('neutralizes spreadsheet formulas in text but keeps negative numbers', () => {
    expect(toCsv(['a', 'b'], [['=SUM(A1)', -3]])).toBe("\uFEFFa,b\r\n'=SUM(A1),-3\r\n");
  });
  it('neutralizes a leading tab used to smuggle a formula', () => {
    expect(toCsv(['a'], [['\t=SUM(A1)']])).toBe("\uFEFFa\r\n'\t=SUM(A1)\r\n");
  });
});
