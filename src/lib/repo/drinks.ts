import type { Db } from '../db/types';
import type { Drink } from '../types';
import { writeAudit } from './audit';

const DRINK_COLUMNS = `id, name, units_per_case as "unitsPerCase", is_active as "isActive", created_at as "createdAt"`;

export async function listDrinks(db: Db, opts: { includeInactive?: boolean } = {}): Promise<Drink[]> {
  const where = opts.includeInactive ? '' : 'where is_active';
  return db.query<Drink>(`select ${DRINK_COLUMNS} from drinks ${where} order by name`);
}

export async function createDrink(
  db: Db,
  actorId: string,
  input: { name: string; unitsPerCase: number },
): Promise<Drink> {
  return db.transaction(async (tx) => {
    const [drink] = await tx.query<Drink>(
      `insert into drinks (name, units_per_case, created_by) values ($1, $2, $3) returning ${DRINK_COLUMNS}`,
      [input.name, input.unitsPerCase, actorId],
    );
    await writeAudit(tx, {
      staffId: actorId,
      action: 'drink.create',
      targetType: 'drink',
      targetId: drink.id,
      details: { name: input.name, unitsPerCase: input.unitsPerCase },
    });
    return drink;
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
