export type SaveResult = "shared" | "downloaded" | "ready";
import type { Photo } from "./mock-data";
import type { LibraryPhoto } from "./library-model";
import { getOriginalDownloadEndpoint } from "./photo-urls";
import { fetchOriginal } from "./fetch-original";

let readyFile: File | null = null;
const listeners = new Set<() => void>();
export function subscribeReadyDownload(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function getReadyDownload() { return readyFile; }
export function clearReadyDownload() { readyFile = null; listeners.forEach(listener => listener()); }
function downloadBlob(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl; link.download = filename;
  (document.querySelector('[role="dialog"]') || document.body).appendChild(link);
  link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
}
export function downloadReadyDownload(): SaveResult {
  if (!readyFile) throw new Error("Ảnh chưa sẵn sàng. Hãy tải lại ảnh gốc.");
  downloadBlob(readyFile, readyFile.name);
  clearReadyDownload();
  return "downloaded";
}
export async function shareReadyDownload(): Promise<SaveResult> {
  const file = readyFile;
  if (!file) throw new Error("Ảnh chưa sẵn sàng. Hãy tải lại ảnh gốc.");
  try {
    if (typeof navigator.share !== "function" || !navigator.canShare?.({ files: [file] })) return downloadReadyDownload();
    // Called directly from a fresh tap, before any network or other await.
    await navigator.share({ files: [file], title: "Lưu ảnh cưới" });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    // Some browsers expose Web Share but deny it in their current context.
    // A regular file download must still work instead of retrying forever.
    downloadBlob(file, file.name);
    if (readyFile === file) clearReadyDownload();
    return "downloaded";
  }
  if (readyFile === file) clearReadyDownload();
  return "shared";
}

export async function downloadOriginal(photo: Photo & Partial<LibraryPhoto>): Promise<SaveResult> {
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
  const response=photoId ? await fetchOriginal(url,photoId) : await fetch(url);if(!response.ok)throw new Error("Không thể tải ảnh");
  const blob=await response.blob();const safeName=filename.replace(/[\\/\u0000-\u001f\u007f]/g,"-");
  const file=new File([blob],safeName,{type:blob.type||"image/jpeg"});
  if (!blob.size || !file.type.startsWith("image/")) throw new Error("Phản hồi không chứa ảnh hợp lệ. Hãy tải lại ảnh gốc.");
  const isMobile=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
  if(isMobile&&typeof navigator.share==="function"&&typeof navigator.canShare==="function"&&navigator.canShare({files:[file]})){
    // Preparing the original is asynchronous: always offer a fresh Save tap
    // rather than attempting Web Share after user activation has expired.
    readyFile = file; listeners.forEach(listener => listener());
    return "ready";
  }
  downloadBlob(blob, safeName); return "downloaded";
}
