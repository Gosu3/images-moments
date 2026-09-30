export const DUPLICATE_UPLOAD_CODE = "DUPLICATE_FILENAME";
export class DuplicateUploadError extends Error {
  constructor(message = "Ảnh trùng tên đã có trong thư viện.") { super(message); this.name = "DuplicateUploadError"; }
}
export function normalizedFilename(filename: string) {
  return filename.normalize("NFC").trim().toLocaleLowerCase("vi");
}
export function findDuplicatePhoto<T extends { filename: string; status?: string; uploadId?: string }>(photos: T[], filename: string, uploadId?: string) {
  const name = normalizedFilename(filename);
  return photos.find(photo => photo.status !== "deleted" && normalizedFilename(photo.filename) === name && (!uploadId || photo.uploadId !== uploadId));
}
