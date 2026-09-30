import { describe, expect, it } from 'vitest';
import { CATEGORY_ALL, CATEGORY_UNCATEGORIZED, categoryOptions, inCategory } from '@/lib/categoryFilter';

const cats = [
  { id: 'a', name: '日本酒' },
  { id: 'b', name: 'ワイン' },
];

describe('inCategory', () => {
  it('all matches everything, including uncategorized', () => {
    expect(inCategory({ categoryId: null }, CATEGORY_ALL)).toBe(true);
    expect(inCategory({ categoryId: 'a' }, CATEGORY_ALL)).toBe(true);
  });
  it('none matches only uncategorized drinks', () => {
    expect(inCategory({ categoryId: null }, CATEGORY_UNCATEGORIZED)).toBe(true);
    expect(inCategory({ categoryId: 'a' }, CATEGORY_UNCATEGORIZED)).toBe(false);
  });
  it('a category id matches only that category', () => {
    expect(inCategory({ categoryId: 'a' }, 'a')).toBe(true);
    expect(inCategory({ categoryId: 'b' }, 'a')).toBe(false);
    expect(inCategory({ categoryId: null }, 'a')).toBe(false);
  });
});

describe('categoryOptions', () => {
  it('counts per category and hides 未分類 when empty', () => {
    const opts = categoryOptions([{ categoryId: 'a' }, { categoryId: 'a' }, { categoryId: 'b' }], cats);
    expect(opts.map((o) => [o.key, o.count])).toEqual([
      ['all', 3],
      ['a', 2],
      ['b', 1],
    ]);
  });
  it('adds 未分類 last when some drinks have no category', () => {
    const opts = categoryOptions([{ categoryId: null }, { categoryId: 'a' }], cats);
    expect(opts.at(-1)).toEqual({ key: 'none', label: '未分類', count: 1 });
    expect(opts.find((o) => o.key === 'b')?.count).toBe(0);
  });
});
