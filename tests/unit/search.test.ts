import { describe, expect, it } from 'vitest';
import { matchesSearch, normalizeForSearch } from '@/lib/search';

describe('normalizeForSearch', () => {
  it('folds katakana to hiragana and full-width to half-width', () => {
    expect(normalizeForSearch('コーラ')).toBe('こーら');
    expect(normalizeForSearch('ｺｰﾗ')).toBe('こーら');
    expect(normalizeForSearch('ＣＯＫＥ')).toBe('coke');
  });
});

describe('matchesSearch', () => {
  it('matches regardless of kana type', () => {
    expect(matchesSearch('コカ・コーラ', 'こーら')).toBe(true);
    expect(matchesSearch('ウーロン茶', 'うーろん')).toBe(true);
  });
  it('matches everything for an empty query', () => {
    expect(matchesSearch('コーラ', '  ')).toBe(true);
  });
  it('does not match unrelated names', () => {
    expect(matchesSearch('ビール', 'こーら')).toBe(false);
  });
  it('ignores middle dots when the query omits them', () => {
    expect(matchesSearch('コカ・コーラ', 'こかこーら')).toBe(true);
  });
});
