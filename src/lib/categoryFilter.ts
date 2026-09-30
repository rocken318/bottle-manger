import type { Category, Drink } from '@/lib/types';

/** 種類プルダウンの「すべて」「未分類」を表す値。カテゴリ id とぶつからない文字列にしている。 */
export const CATEGORY_ALL = 'all';
export const CATEGORY_UNCATEGORIZED = 'none';

export function inCategory(drink: Pick<Drink, 'categoryId'>, key: string): boolean {
  if (key === CATEGORY_ALL) return true;
  if (key === CATEGORY_UNCATEGORIZED) return drink.categoryId === null;
  return drink.categoryId === key;
}

export type CategoryOption = { key: string; label: string; count: number };

/**
 * プルダウンの選択肢。件数は、渡された（種類以外の条件を通った）ボトルで数える。
 * 未分類は 0 件なら出さない（選択中のときだけ残す）。
 */
export function categoryOptions(
  drinks: Pick<Drink, 'categoryId'>[],
  categories: Pick<Category, 'id' | 'name'>[],
  selected: string = CATEGORY_ALL,
): CategoryOption[] {
  const count = (key: string) => drinks.filter((d) => inCategory(d, key)).length;
  const options: CategoryOption[] = [
    { key: CATEGORY_ALL, label: 'すべて', count: count(CATEGORY_ALL) },
    ...categories.map((c) => ({ key: c.id, label: c.name, count: count(c.id) })),
  ];
  const uncategorized = count(CATEGORY_UNCATEGORIZED);
  if (uncategorized > 0 || selected === CATEGORY_UNCATEGORIZED) options.push({ key: CATEGORY_UNCATEGORIZED, label: '未分類', count: uncategorized });
  return options;
}
