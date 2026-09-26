import type { Db } from '../db/types';
import type { Location } from '../types';
import { writeAudit } from './audit';

const LOCATION_COLUMNS = `id, name, sort_order as "sortOrder", is_active as "isActive"`;

export async function listLocations(db: Db, opts: { includeInactive?: boolean } = {}): Promise<Location[]> {
  const where = opts.includeInactive ? '' : 'where is_active';
  return db.query<Location>(`select ${LOCATION_COLUMNS} from locations ${where} order by sort_order, name`);
}

export async function createLocation(
  db: Db,
  actorId: string,
  input: { name: string; sortOrder: number },
): Promise<Location> {
  return db.transaction(async (tx) => {
    const [location] = await tx.query<Location>(
      `insert into locations (name, sort_order) values ($1, $2) returning ${LOCATION_COLUMNS}`,
      [input.name, input.sortOrder],
    );
    await writeAudit(tx, {
      staffId: actorId,
      action: 'location.create',
      targetType: 'location',
      targetId: location.id,
      details: input,
    });
    return location;
  });
}

export async function updateLocation(
  db: Db,
  actorId: string,
  input: { id: string; name: string; sortOrder: number; isActive: boolean },
): Promise<void> {
  await db.transaction(async (tx) => {
    const rows = await tx.query(
      'update locations set name = $2, sort_order = $3, is_active = $4 where id = $1 returning id',
      [input.id, input.name, input.sortOrder, input.isActive],
    );
    if (rows.length === 0) throw new Error('location_not_found');
    await writeAudit(tx, {
      staffId: actorId,
      action: 'location.update',
      targetType: 'location',
      targetId: input.id,
      details: { name: input.name, sortOrder: input.sortOrder, isActive: input.isActive },
    });
  });
}
