import type { Photo } from "./mock-data";
import type { LibraryPhoto } from "./library-model";
type DisplayPhoto = Photo & Partial<LibraryPhoto>;
export function isPhotoReady(photo: DisplayPhoto) { return !photo.status || photo.status === "ready"; }
function route(photo: DisplayPhoto, variant: string) {
  return `/api/library/photo/${encodeURIComponent(photo.id)}?variant=${variant}`;
}
export function getPhotoThumbnailUrl(photo: DisplayPhoto) {
  return photo.key || photo.pipeline === "r2-v2" ? route(photo, "thumbnail") : photo.preview;
}
export function getPhotoPreviewUrl(photo: DisplayPhoto) {
  return photo.key || photo.pipeline === "r2-v2" ? route(photo, "preview") : photo.src;
}
// Direct R2 URLs may 404 while a variant is still being generated; retry once
// through the app route, which builds the variant on demand.
export function imageFallback(photo: DisplayPhoto, variant: "thumbnail" | "preview") {
  return (event: { currentTarget: HTMLImageElement }) => {
    const target = route(photo, variant);
    if (!event.currentTarget.src.endsWith(target)) event.currentTarget.src = target;
  };
}
export function getOriginalDownloadEndpoint(photoId: string) {
  return `/api/photos/${encodeURIComponent(photoId)}/download`;
}
