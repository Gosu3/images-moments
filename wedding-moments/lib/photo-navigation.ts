/** Keep the same photo when favorites change; fall back to its nearest neighbor. */
export function resolvePhotoIndex(photos: readonly { id: string }[], active: { id: string; index: number } | null): number | null {
  if (!active || !photos.length) return null;
  const index = photos.findIndex(photo => photo.id === active.id);
  return index >= 0 ? index : Math.min(Math.max(0, active.index), photos.length - 1);
}
