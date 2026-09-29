import type { Db } from '../db/types';
import type { Drink } from '../types';
import { writeAudit } from './audit';

const DRINK_COLUMNS = `id, name, units_per_case as "unitsPerCase", is_active as "isActive", created_at as "createdAt", category_id as "categoryId"`;

// 一覧は d.* にカテゴリ名を足す。廃止したカテゴリに属していても行は出す（画面側で付け替えられるように）。
const DRINK_LIST_COLUMNS = `d.id, d.name, d.units_per_case as "unitsPerCase", d.is_active as "isActive",
  d.created_at as "createdAt", d.category_id as "categoryId", c.name as "categoryName"`;

/** 並びは「カテゴリの表示順 → ボトル名」。未分類は最後にまとめる。 */
export async function listDrinks(db: Db, opts: { includeInactive?: boolean } = {}): Promise<Drink[]> {
  const where = opts.includeInactive ? '' : 'where d.is_active';
  return db.query<Drink>(
    `select ${DRINK_LIST_COLUMNS}
       from drinks d
       left join categories c on c.id = d.category_id
      ${where}
      order by case when d.category_id is null then 1 else 0 end, c.sort_order, c.name, d.name`,
  );
}

export async function createDrink(
  db: Db,
  actorId: string,
  input: { name: string; unitsPerCase: number; categoryId?: string | null },
): Promise<Drink> {
  const categoryId = input.categoryId ?? null;
  return db.transaction(async (tx) => {
    let categoryName: string | null = null;
    if (categoryId !== null) {
      const [cat] = await tx.query<{ name: string; isActive: boolean }>(
        'select name, is_active as "isActive" from categories where id = $1',
        [categoryId],
      );
      if (!cat) throw new Error('category_not_found');
      if (!cat.isActive) throw new Error('category_inactive');
      categoryName = cat.name;
    }
    const [drink] = await tx.query<Omit<Drink, 'categoryName'>>(
      `insert into drinks (name, units_per_case, created_by, category_id)
       values ($1, $2, $3, $4) returning ${DRINK_COLUMNS}`,
      [input.name, input.unitsPerCase, actorId, categoryId],
    );
    await writeAudit(tx, {
      staffId: actorId,
      action: 'drink.create',
      targetType: 'drink',
      targetId: drink.id,
      details: { name: input.name, unitsPerCase: input.unitsPerCase, category: categoryName },
    });
    return { ...drink, categoryName };
  });
}

export async function setDrinkActive(db: Db, actorId: string, id: string, isActive: boolean): Promise<void> {
  await db.transaction(async (tx) => {
    if (!isActive) {
      const [current] = await tx.query<{ isActive: boolean }>(
        'select is_active as "isActive" from drinks where id = $1',
        [id],
      );
      if (current?.isActive) {
        const [{ total }] = await tx.query<{ total: string | number }>(
          'select coalesce(sum(abs(quantity)),0) as total from stock_levels where drink_id = $1',
          [id],
        );
        if (Number(total) > 0) throw new Error('drink_has_stock');
      }
    }
    const rows = await tx.query<{ name: string }>(
      'update drinks set is_active = $2 where id = $1 and is_active <> $2 returning name',
      [id, isActive],
    );
    if (rows.length === 0) {
      const [existing] = await tx.query<{ id: string }>('select id from drinks where id = $1', [id]);
      if (!existing) throw new Error('drink_not_found');
      return;
    }
    await writeAudit(tx, {
      staffId: actorId,
      action: isActive ? 'drink.activate' : 'drink.deactivate',
      targetType: 'drink',
      targetId: id,
      details: { name: rows[0].name },
    });
  });
}

export async function updateDrink(
  db: Db,
  actorId: string,
  input: { id: string; name: string; unitsPerCase: number },
): Promise<void> {
  await db.transaction(async (tx) => {
    const [before] = await tx.query<{ name: string; unitsPerCase: number }>(
      'select name, units_per_case as "unitsPerCase" from drinks where id = $1 for update',
      [input.id],
    );
    if (!before) throw new Error('drink_not_found');
    if (before.name === input.name && before.unitsPerCase === input.unitsPerCase) return;
    await tx.query('update drinks set name = $2, units_per_case = $3 where id = $1', [
      input.id,
      input.name,
      input.unitsPerCase,
    ]);
    await writeAudit(tx, {
      staffId: actorId,
      action: 'drink.update',
      targetType: 'drink',
      targetId: input.id,
      details: {
        name: input.name,
        before: { name: before.name, unitsPerCase: before.unitsPerCase },
        after: { name: input.name, unitsPerCase: input.unitsPerCase },
      },
    });
  });
}
