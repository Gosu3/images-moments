export type SaveResult = "shared" | "downloaded";
import type { Photo } from "./mock-data";
import type { LibraryPhoto } from "./library-model";
import { getOriginalDownloadEndpoint } from "./photo-urls";
import { fetchOriginal } from "./fetch-original";

function downloadBlob(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl; link.download = filename;
  (document.querySelector('[role="dialog"]') || document.body).appendChild(link);
  link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
}
const prepared = new Map<string, { file?: File; promise: Promise<File> }>();
function mobileDevice() { return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); }
async function fetchImageFile(url: string, filename: string, photoId?: string) {
  const response = photoId ? await fetchOriginal(url, photoId) : await fetch(url);
  if (!response.ok) throw new Error("Không thể tải ảnh gốc.");
  const blob = await response.blob();
  if (!blob.size || !blob.type.startsWith("image/")) throw new Error("Phản hồi không chứa ảnh hợp lệ. Hãy tải lại ảnh gốc.");
  return new File([blob], filename.replace(/[\\/\u0000-\u001f\u007f]/g, "-"), { type: blob.type });
}
export function preparePreviewDownload(photo: Photo & Partial<LibraryPhoto>) {
  if (!mobileDevice()) return Promise.resolve(null);
  const existing = prepared.get(photo.id);
  if (existing) return existing.promise;
  // Only keep the current and previous original, not an entire album.
  while (prepared.size >= 2) prepared.delete(prepared.keys().next().value!);
  const url = !photo.key && !photo.pipeline && !photo.src.startsWith("/api/") ? photo.src : getOriginalDownloadEndpoint(photo.id);
  const filename = photo.filename || `wedding-moment-${photo.id}.jpg`;
  const promise = photo.pipeline === "r2-v2" ? fetch(getOriginalDownloadEndpoint(photo.id), { method: "POST" }).then(async response => {
    const result = await response.json() as { url?: string; filename?: string; error?: string };
    if (!response.ok || !result.url) throw new Error(result.error || "Không thể tải ảnh gốc.");
    return fetchImageFile(result.url, result.filename || filename, photo.id);
  }) : fetchImageFile(url, filename);
  const entry: { file?: File; promise: Promise<File> } = { promise };
  prepared.set(photo.id, entry);
  entry.promise.then(file => { entry.file = file; }, () => { if (prepared.get(photo.id) === entry) prepared.delete(photo.id); });
  return entry.promise;
}
async function shareFile(file: File): Promise<SaveResult> {
  if (mobileDevice() && navigator.canShare?.({ files: [file] }) && typeof navigator.share === "function") {
    try { await navigator.share({ files: [file], title: "Lưu ảnh cưới" }); return "shared"; }
    catch (error) {
      if (!["NotAllowedError", "InvalidStateError"].includes((error as Error).name)) throw error;
      // Fetching an original can outlive transient activation, especially when
      // the visitor opens another photo. Never park it behind a second Save tap.
      // A cancelled native sheet (AbortError) still propagates without downloading.
    }
  }
  downloadBlob(file, file.name); return "downloaded";
}

export async function downloadOriginal(photo: Photo & Partial<LibraryPhoto>): Promise<SaveResult> {
  const cached = prepared.get(photo.id);
  if (mobileDevice() && cached) {
    // A prepared file reaches Web Share synchronously within the click.
    if (cached.file) return shareFile(cached.file);
    return shareFile(await cached.promise);
  }
  const filename = photo.filename || `wedding-moment-${photo.id}.jpg`;
  if (!photo.key && !photo.pipeline && !photo.src.startsWith("/api/")) return savePhotoToDevice(photo.src, filename);
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  // Fetch the same-origin stream immediately on mobile. Avoid a ticket round
  // trip followed by a blocked cross-origin request before fetching it again.
  if (mobile && photo.pipeline !== "r2-v2") return savePhotoToDevice(getOriginalDownloadEndpoint(photo.id), filename);
  const response = await fetch(getOriginalDownloadEndpoint(photo.id), { method: "POST" });
  const result = await response.json() as { url?: string; filename?: string; error?: string };
  if (!response.ok || !result.url) throw new Error(result.error || "Không thể tải ảnh gốc.");
  if (!mobile) {
    const link = document.createElement("a"); link.href = result.url; link.download = result.filename || filename;
    link.rel = "noopener"; document.body.appendChild(link); link.click(); link.remove();
    return "downloaded";
  }
  return savePhotoToDevice(result.url, result.filename || filename, photo.id);
}

export async function savePhotoToDevice(url:string,filename:string,photoId?:string):Promise<SaveResult>{
  return shareFile(await fetchImageFile(url, filename, photoId));
}
