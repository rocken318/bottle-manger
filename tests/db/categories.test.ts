import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/lib/db/types';
import { createCategory, listCategories, setDrinkCategory, updateCategory } from '@/lib/repo/categories';
import { createDrink, listDrinks } from '@/lib/repo/drinks';
import { listAuditLogs } from '@/lib/repo/audit';
import { createTestDb, insertStaff } from '../helpers/testDb';

let db: Db;
let staffId: string;

beforeEach(async () => {
  db = await createTestDb();
  staffId = await insertStaff(db);
});

/** 0008 のシードで入る 7 種類。 */
const SEEDED = ['焼酎', 'ウイスキー', 'ブランデー', 'シャンパン・スパークリング', 'ワイン', '日本酒', 'その他'];

describe('categories repository', () => {
  it('ships the seven seeded categories in display order', async () => {
    const cats = await listCategories(db);
    expect(cats.map((c) => c.name)).toEqual(SEEDED);
  });

  it('creates a category and logs it', async () => {
    const c = await createCategory(db, staffId, { name: 'ビール', sortOrder: 8 });
    expect(c).toMatchObject({ name: 'ビール', sortOrder: 8, isActive: true });
    expect((await listAuditLogs(db, 1))[0]).toMatchObject({ action: 'category.create', targetId: c.id });
  });

  it('rejects duplicate names', async () => {
    await expect(createCategory(db, staffId, { name: '焼酎', sortOrder: 9 })).rejects.toMatchObject({
      code: '23505',
    });
  });

  it('renames and reorders, and logs before/after', async () => {
    const [shochu] = await listCategories(db);
    await updateCategory(db, staffId, { id: shochu.id, name: '焼酎・泡盛', sortOrder: 0, isActive: true });
    const cats = await listCategories(db);
    expect(cats[0]).toMatchObject({ id: shochu.id, name: '焼酎・泡盛', sortOrder: 0 });
    const [log] = await listAuditLogs(db, 1);
    expect(log.action).toBe('category.update');
    expect(log.details).toMatchObject({ before: { name: '焼酎' }, after: { name: '焼酎・泡盛' } });
  });

  it('does not log when nothing changed', async () => {
    const [c] = await listCategories(db);
    const before = (await listAuditLogs(db, 50)).length;
    await updateCategory(db, staffId, { id: c.id, name: c.name, sortOrder: c.sortOrder, isActive: c.isActive });
    expect((await listAuditLogs(db, 50)).length).toBe(before);
  });

  it('hides deactivated categories but keeps their drinks', async () => {
    const [shochu] = await listCategories(db);
    const d = await createDrink(db, staffId, { name: '赤霧島', unitsPerCase: 1, categoryId: shochu.id });

    await updateCategory(db, staffId, { id: shochu.id, name: shochu.name, sortOrder: 1, isActive: false });

    expect((await listCategories(db)).map((c) => c.name)).not.toContain('焼酎');
    expect((await listCategories(db, { includeInactive: true })).map((c) => c.name)).toContain('焼酎');

    // ボトルは消えず、紐付けも残る（画面側で「未分類」扱いになるだけ）。
    const [row] = (await listDrinks(db)).filter((x) => x.id === d.id);
    expect(row).toBeDefined();
    expect(row.categoryId).toBe(shochu.id);
  });
});

describe('setDrinkCategory', () => {
  it('assigns, reassigns and clears, logging each change', async () => {
    const cats = await listCategories(db);
    const shochu = cats[0];
    const whisky = cats[1];
    const d = await createDrink(db, staffId, { name: '魔王', unitsPerCase: 1 });
    expect(d.categoryId).toBeNull();

    await setDrinkCategory(db, staffId, d.id, shochu.id);
    let [row] = (await listDrinks(db)).filter((x) => x.id === d.id);
    expect(row).toMatchObject({ categoryId: shochu.id, categoryName: '焼酎' });
    expect((await listAuditLogs(db, 1))[0]).toMatchObject({
      action: 'drink.category',
      details: { name: '魔王', before: null, after: '焼酎' },
    });

    await setDrinkCategory(db, staffId, d.id, whisky.id);
    expect((await listAuditLogs(db, 1))[0].details).toMatchObject({ before: '焼酎', after: 'ウイスキー' });

    await setDrinkCategory(db, staffId, d.id, null);
    [row] = (await listDrinks(db)).filter((x) => x.id === d.id);
    expect(row.categoryId).toBeNull();
    expect((await listAuditLogs(db, 1))[0].details).toMatchObject({ before: 'ウイスキー', after: null });
  });

  it('does not log when the category is unchanged', async () => {
    const [shochu] = await listCategories(db);
    const d = await createDrink(db, staffId, { name: '村尾', unitsPerCase: 1, categoryId: shochu.id });
    const before = (await listAuditLogs(db, 50)).length;
    await setDrinkCategory(db, staffId, d.id, shochu.id);
    expect((await listAuditLogs(db, 50)).length).toBe(before);
  });

  it('refuses an unknown or deactivated category', async () => {
    const [shochu] = await listCategories(db);
    const d = await createDrink(db, staffId, { name: '中々', unitsPerCase: 1 });

    await expect(
      setDrinkCategory(db, staffId, d.id, '00000000-0000-4000-8000-000000000000'),
    ).rejects.toThrow('category_not_found');

    await updateCategory(db, staffId, { id: shochu.id, name: shochu.name, sortOrder: 1, isActive: false });
    await expect(setDrinkCategory(db, staffId, d.id, shochu.id)).rejects.toThrow('category_inactive');
  });
});

describe('listDrinks ordering', () => {
  it('orders by category sort order, then name, with uncategorized last', async () => {
    const cats = await listCategories(db);
    const shochu = cats[0]; // sort_order 1
    const whisky = cats[1]; // sort_order 2

    await createDrink(db, staffId, { name: '山崎', unitsPerCase: 1, categoryId: whisky.id });
    await createDrink(db, staffId, { name: '魔王', unitsPerCase: 1, categoryId: shochu.id });
    await createDrink(db, staffId, { name: '赤霧島', unitsPerCase: 1, categoryId: shochu.id });
    await createDrink(db, staffId, { name: 'なにか', unitsPerCase: 1 });

    expect((await listDrinks(db)).map((d) => d.name)).toEqual(['赤霧島', '魔王', '山崎', 'なにか']);
  });
});
