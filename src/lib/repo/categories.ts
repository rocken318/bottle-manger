import type { Db } from '../db/types';
import type { Category } from '../types';
import { writeAudit } from './audit';

const CATEGORY_COLUMNS = `id, name, sort_order as "sortOrder", is_active as "isActive"`;

export async function listCategories(db: Db, opts: { includeInactive?: boolean } = {}): Promise<Category[]> {
  const where = opts.includeInactive ? '' : 'where is_active';
  return db.query<Category>(`select ${CATEGORY_COLUMNS} from categories ${where} order by sort_order, name`);
}

export async function createCategory(
  db: Db,
  actorId: string,
  input: { name: string; sortOrder: number },
): Promise<Category> {
  return db.transaction(async (tx) => {
    const [category] = await tx.query<Category>(
      `insert into categories (name, sort_order) values ($1, $2) returning ${CATEGORY_COLUMNS}`,
      [input.name, input.sortOrder],
    );
    await writeAudit(tx, {
      staffId: actorId,
      action: 'category.create',
      targetType: 'category',
      targetId: category.id,
      details: input,
    });
    return category;
  });
}

/**
 * 拠点と違い、カテゴリは在庫を持たないので無効化を止める条件はない。
 * 無効にすると入力の選択肢から消え、属していたボトルは「未分類」として扱われる（drinks の行は消えない）。
 */
export async function updateCategory(
  db: Db,
  actorId: string,
  input: { id: string; name: string; sortOrder: number; isActive: boolean },
): Promise<void> {
  await db.transaction(async (tx) => {
    const [before] = await tx.query<{ name: string; sortOrder: number; isActive: boolean }>(
      'select name, sort_order as "sortOrder", is_active as "isActive" from categories where id = $1 for update',
      [input.id],
    );
    if (!before) throw new Error('category_not_found');
    if (before.name === input.name && before.sortOrder === input.sortOrder && before.isActive === input.isActive) {
      return;
    }
    await tx.query('update categories set name = $2, sort_order = $3, is_active = $4 where id = $1', [
      input.id,
      input.name,
      input.sortOrder,
      input.isActive,
    ]);
    const [{ n }] = await tx.query<{ n: string }>(
      'select count(*)::text as n from drinks where category_id = $1',
      [input.id],
    );
    await writeAudit(tx, {
      staffId: actorId,
      action: 'category.update',
      targetType: 'category',
      targetId: input.id,
      details: {
        name: input.name,
        drinkCount: Number(n),
        before,
        after: { name: input.name, sortOrder: input.sortOrder, isActive: input.isActive },
      },
    });
  });
}

/** ボトル1本のカテゴリを付け替える。categoryId が null なら「未分類」に戻す。 */
export async function setDrinkCategory(
  db: Db,
  actorId: string,
  drinkId: string,
  categoryId: string | null,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [before] = await tx.query<{ name: string; categoryId: string | null }>(
      'select name, category_id as "categoryId" from drinks where id = $1 for update',
      [drinkId],
    );
    if (!before) throw new Error('drink_not_found');
    if (before.categoryId === categoryId) return;

    if (categoryId !== null) {
      const [cat] = await tx.query<{ isActive: boolean }>(
        'select is_active as "isActive" from categories where id = $1',
        [categoryId],
      );
      if (!cat) throw new Error('category_not_found');
      if (!cat.isActive) throw new Error('category_inactive');
    }

    await tx.query('update drinks set category_id = $2 where id = $1', [drinkId, categoryId]);

    const nameOf = async (id: string | null) => {
      if (id === null) return null;
      const [r] = await tx.query<{ name: string }>('select name from categories where id = $1', [id]);
      return r?.name ?? null;
    };
    await writeAudit(tx, {
      staffId: actorId,
      action: 'drink.category',
      targetType: 'drink',
      targetId: drinkId,
      details: {
        name: before.name,
        before: await nameOf(before.categoryId),
        after: await nameOf(categoryId),
      },
    });
  });
}
