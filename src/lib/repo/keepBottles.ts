import type { Db } from '../db/types';
import type { KeepBottle } from '../types';
import { writeAudit } from './audit';

// date 列は文字列で返す。Date にすると実行環境のタイムゾーンで 1 日ずれることがある。
const KEEP_COLUMNS = `id, customer_name as "customerName", drink_id as "drinkId", drink_name as "drinkName",
  to_char(registered_on, 'YYYY-MM-DD') as "registeredOn", to_char(last_used_on, 'YYYY-MM-DD') as "lastUsedOn",
  status, to_char(dropped_on, 'YYYY-MM-DD') as "droppedOn", note, created_at as "createdAt"`;

/** キープ中は最終利用日が古い順（期限が近い順）、期限切れは期限切れにした日が新しい順。 */
export async function listKeepBottles(db: Db, status: 'active' | 'dropped'): Promise<KeepBottle[]> {
  const order =
    status === 'active'
      ? 'last_used_on, registered_on, customer_name, id'
      : 'dropped_on desc, customer_name, id';
  return db.query<KeepBottle>(`select ${KEEP_COLUMNS} from keep_bottles where status = $1 order by ${order}`, [status]);
}

export async function createKeepBottle(
  db: Db,
  actorId: string,
  input: { customerName: string; drinkId: string; registeredOn: string; note: string },
): Promise<KeepBottle> {
  return db.transaction(async (tx) => {
    const [drink] = await tx.query<{ name: string; isActive: boolean }>(
      'select name, is_active as "isActive" from drinks where id = $1',
      [input.drinkId],
    );
    if (!drink) throw new Error('drink_not_found');
    if (!drink.isActive) throw new Error('inactive_drink');
    const [bottle] = await tx.query<KeepBottle>(
      `insert into keep_bottles (customer_name, drink_id, drink_name, registered_on, last_used_on, note, staff_id)
       values ($1, $2, $3, $4, $4, $5, $6) returning ${KEEP_COLUMNS}`,
      [input.customerName, input.drinkId, drink.name, input.registeredOn, input.note, actorId],
    );
    await writeAudit(tx, {
      staffId: actorId,
      action: 'keep.create',
      targetType: 'keep_bottle',
      targetId: bottle.id,
      details: { name: `${input.customerName} / ${drink.name}`, registeredOn: input.registeredOn },
    });
    return bottle;
  });
}

/** キープ中の行を取り直してロックする。なければ keep_not_found、期限切れなら keep_not_active。 */
async function lockActive(tx: Db, id: string): Promise<{ customerName: string; drinkName: string }> {
  const [row] = await tx.query<{ customerName: string; drinkName: string; status: string }>(
    'select customer_name as "customerName", drink_name as "drinkName", status from keep_bottles where id = $1 for update',
    [id],
  );
  if (!row) throw new Error('keep_not_found');
  if (row.status !== 'active') throw new Error('keep_not_active');
  return row;
}

/** 最終利用日を today にする。登録日より前には戻さない。 */
export async function touchKeepBottle(db: Db, actorId: string, id: string, today: string): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await lockActive(tx, id);
    await tx.query('update keep_bottles set last_used_on = greatest(last_used_on, $2::date) where id = $1', [id, today]);
    await writeAudit(tx, {
      staffId: actorId,
      action: 'keep.touch',
      targetType: 'keep_bottle',
      targetId: id,
      details: { name: `${row.customerName} / ${row.drinkName}`, lastUsedOn: today },
    });
  });
}

export async function updateKeepNote(db: Db, actorId: string, id: string, note: string): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await lockActive(tx, id);
    await tx.query('update keep_bottles set note = $2 where id = $1', [id, note]);
    await writeAudit(tx, {
      staffId: actorId,
      action: 'keep.note',
      targetType: 'keep_bottle',
      targetId: id,
      details: { name: `${row.customerName} / ${row.drinkName}` },
    });
  });
}

export async function dropKeepBottle(db: Db, actorId: string, id: string, today: string): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await lockActive(tx, id);
    await tx.query(`update keep_bottles set status = 'dropped', dropped_on = $2::date where id = $1`, [id, today]);
    await writeAudit(tx, {
      staffId: actorId,
      action: 'keep.drop',
      targetType: 'keep_bottle',
      targetId: id,
      details: { name: `${row.customerName} / ${row.drinkName}`, droppedOn: today },
    });
  });
}
