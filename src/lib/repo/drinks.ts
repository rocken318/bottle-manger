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
    const rows = await tx.query<{ name: string }>(
      'update drinks set is_active = $2 where id = $1 returning name',
      [id, isActive],
    );
    if (rows.length === 0) throw new Error('drink_not_found');
    await writeAudit(tx, {
      staffId: actorId,
      action: isActive ? 'drink.activate' : 'drink.deactivate',
      targetType: 'drink',
      targetId: id,
      details: { name: rows[0].name },
    });
  });
}
