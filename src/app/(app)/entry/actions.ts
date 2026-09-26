'use server';

import { revalidatePath } from 'next/cache';
import { requireStaff } from '@/lib/auth/current';
import { getDb } from '@/lib/db/client';
import { toUserMessage } from '@/lib/errors';
import { listDrinks } from '@/lib/repo/drinks';
import { listLocations } from '@/lib/repo/locations';
import { applyMovements, batchExists, findNegativeResults, getStockLevels } from '@/lib/repo/stock';
import { entrySchema, toMovementInput } from '@/lib/validation';

export type EntryResult =
  | { status: 'ok'; count: number }
  | { status: 'confirm'; warnings: string[] }
  | { status: 'error'; message: string };

export async function submitEntry(payload: unknown): Promise<EntryResult> {
  const staff = await requireStaff();
  const parsed = entrySchema.safeParse(payload);
  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message ?? '入力内容を確認してください' };
  }
  const { batchId, confirmNegative, note } = parsed.data;
  const items = parsed.data.items.map((item) => toMovementInput(item, note));
  const db = getDb();

  try {
    // A retry of a batch that was already stored must not ask for confirmation again.
    if (await batchExists(db, batchId)) return { status: 'ok', count: items.length };

    if (!confirmNegative) {
      const negatives = findNegativeResults(await getStockLevels(db), items);
      if (negatives.length > 0) {
        const [drinks, locations] = await Promise.all([
          listDrinks(db, { includeInactive: true }),
          listLocations(db, { includeInactive: true }),
        ]);
        const drinkName = new Map(drinks.map((d) => [d.id, d.name]));
        const locationName = new Map(locations.map((l) => [l.id, l.name]));
        return {
          status: 'confirm',
          warnings: negatives.map(
            (n) => `${locationName.get(n.locationId)}の${drinkName.get(n.drinkId)}が ${n.resulting}本 になります`,
          ),
        };
      }
    }

    const ids = await applyMovements(db, batchId, staff.id, items);
    revalidatePath('/', 'layout');
    return { status: 'ok', count: ids.length };
  } catch (e) {
    return { status: 'error', message: toUserMessage(e) };
  }
}
