// Browser-only: shrinks a phone photo before upload (a 12MP photo is several MB; this makes it ~200KB).

const MAX_SIDE = 1280;
const QUALITY = 0.8;

async function decode(file: File): Promise<CanvasImageSource & { width: number; height: number }> {
  try {
    // Honors EXIF orientation, so portrait photos are not turned sideways.
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/** Returns a JPEG no larger than MAX_SIDE on its longest side. */
export async function resizeImage(file: File): Promise<Blob> {
  const image = await decode(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas_unavailable');
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  if (image instanceof ImageBitmap) image.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('encode_failed'))), 'image/jpeg', QUALITY),
  );
}
