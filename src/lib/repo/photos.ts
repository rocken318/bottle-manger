import type { Db } from '../db/types';
import { isAdminRole } from '../permissions';
import type { Role } from '../types';

export const MAX_PHOTOS_PER_BATCH = 3;
/** The phone resizes photos to about 200KB; this is only a safety limit. */
export const MAX_PHOTO_BYTES = 1_500_000;
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type PhotoType = (typeof PHOTO_TYPES)[number];

/**
 * Attaches photos to a 破損・廃棄 batch. Only the person who entered it or an admin may add them,
 * up to MAX_PHOTOS_PER_BATCH in total.
 */
export async function addBatchPhotos(
  db: Db,
  actor: { id: string; role: Role },
  batchId: string,
  photos: { contentType: PhotoType; data: Uint8Array }[],
): Promise<string[]> {
  return db.transaction(async (tx) => {
    await tx.query(`select pg_advisory_xact_lock(hashtextextended('photos:' || $1, 0))`, [batchId]);
    const [batch] = await tx.query<{ staffId: string; disposes: boolean }>(
      `select min(staff_id::text) as "staffId", bool_or(type = 'dispose') as disposes
         from stock_movements where batch_id = $1 having count(*) > 0`,
      [batchId],
    );
    if (!batch) throw new Error('movement_not_found');
    if (!batch.disposes) throw new Error('photo_not_allowed');
    if (batch.staffId !== actor.id && !isAdminRole(actor.role)) throw new Error('photo_not_allowed');
    const [{ n }] = await tx.query<{ n: number }>(
      'select count(*)::integer as n from movement_photos where batch_id = $1',
      [batchId],
    );
    if (Number(n) + photos.length > MAX_PHOTOS_PER_BATCH) throw new Error('too_many_photos');
    const ids: string[] = [];
    for (const p of photos) {
      if (p.data.byteLength > MAX_PHOTO_BYTES) throw new Error('photo_too_large');
      const [row] = await tx.query<{ id: string }>(
        `insert into movement_photos (batch_id, content_type, data, created_by) values ($1, $2, $3, $4) returning id`,
        [batchId, p.contentType, p.data, actor.id],
      );
      ids.push(row.id);
    }
    return ids;
  });
}

export async function getPhoto(db: Db, id: string): Promise<{ contentType: string; data: Uint8Array } | null> {
  const [row] = await db.query<{ contentType: string; data: Uint8Array }>(
    'select content_type as "contentType", data from movement_photos where id = $1',
    [id],
  );
  return row ?? null;
}
