/** Small thumbnails of attached photos; each opens the full image in a new tab. */
export function PhotoThumbs({ ids }: { ids: string[] }) {
  if (ids.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {ids.map((id, i) => (
        <a key={id} href={`/api/photos/${id}`} target="_blank" rel="noreferrer" aria-label={`写真${i + 1}を開く`}>
          <img src={`/api/photos/${id}`} alt={`写真${i + 1}`} loading="lazy" className="h-16 w-16 rounded border object-cover" />
        </a>
      ))}
    </div>
  );
}
