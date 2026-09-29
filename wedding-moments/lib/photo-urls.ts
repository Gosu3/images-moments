import type { Photo } from "./mock-data";
import type { LibraryPhoto } from "./library-model";
type DisplayPhoto = Photo & Partial<LibraryPhoto>;
export function isPhotoReady(photo: DisplayPhoto) { return !photo.status || photo.status === "ready"; }
function route(photo: DisplayPhoto, variant: string) {
  return `/api/library/photo/${encodeURIComponent(photo.id)}?variant=${variant}`;
}
export function getPhotoThumbnailUrl(photo: DisplayPhoto) {
  return photo.pipeline === "r2-v2" ? route(photo, "thumbnail") : photo.preview;
}
export function getPhotoPreviewUrl(photo: DisplayPhoto) {
  return photo.pipeline === "r2-v2" ? route(photo, "preview") : photo.src;
}
export function getOriginalDownloadEndpoint(photoId: string) {
  return `/api/photos/${encodeURIComponent(photoId)}/download`;
}
