import type { NextRequest } from 'next/server';
import { getCurrentStaff } from '@/lib/auth/current';
import { getDb } from '@/lib/db/client';
import { getPhoto } from '@/lib/repo/photos';
import { idSchema } from '@/lib/validation';

/** Serves an attached photo to logged-in staff only. */
export async function GET(_request: NextRequest, ctx: RouteContext<'/api/photos/[id]'>) {
  if (!(await getCurrentStaff())) return new Response('Unauthorized', { status: 401 });
  const id = idSchema.safeParse((await ctx.params).id);
  if (!id.success) return new Response('Not Found', { status: 404 });
  const photo = await getPhoto(getDb(), id.data);
  if (!photo) return new Response('Not Found', { status: 404 });
  return new Response(new Uint8Array(photo.data), {
    headers: {
      'Content-Type': photo.contentType,
      // Photos never change; keep them in the browser cache only (they are private).
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
