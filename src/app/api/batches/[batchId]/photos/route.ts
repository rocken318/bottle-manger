import type { NextRequest } from 'next/server';
import { getCurrentStaff } from '@/lib/auth/current';
import { getDb } from '@/lib/db/client';
import { toUserMessage } from '@/lib/errors';
import { addBatchPhotos, MAX_PHOTOS_PER_BATCH, PHOTO_TYPES, type PhotoType } from '@/lib/repo/photos';
import { idSchema } from '@/lib/validation';

/** Uploads the photos of a 破損・廃棄 batch (multipart field "photo", repeated). Sent after the batch is saved. */
export async function POST(request: NextRequest, ctx: RouteContext<'/api/batches/[batchId]/photos'>) {
  const staff = await getCurrentStaff();
  if (!staff) return Response.json({ error: 'ログインしてください' }, { status: 401 });
  const batchId = idSchema.safeParse((await ctx.params).batchId);
  if (!batchId.success) return Response.json({ error: '不正な ID です' }, { status: 400 });

  const files = (await request.formData()).getAll('photo').filter((f): f is File => f instanceof File);
  if (files.length === 0) return Response.json({ error: '写真がありません' }, { status: 400 });
  if (files.length > MAX_PHOTOS_PER_BATCH) return Response.json({ error: toUserMessage(new Error('too_many_photos')) }, { status: 400 });
  if (files.some((f) => !(PHOTO_TYPES as readonly string[]).includes(f.type))) {
    return Response.json({ error: '写真は JPEG・PNG・WebP にしてください' }, { status: 400 });
  }
  try {
    const photos = await Promise.all(
      files.map(async (f) => ({ contentType: f.type as PhotoType, data: new Uint8Array(await f.arrayBuffer()) })),
    );
    const ids = await addBatchPhotos(getDb(), staff, batchId.data, photos);
    return Response.json({ ids });
  } catch (e) {
    return Response.json({ error: toUserMessage(e) }, { status: 400 });
  }
}
