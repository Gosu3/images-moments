export type SaveResult = "shared" | "downloaded";
import type { Photo } from "./mock-data";
import type { LibraryPhoto } from "./library-model";
import { getOriginalDownloadEndpoint } from "./photo-urls";

export async function downloadOriginal(photo: Photo & Partial<LibraryPhoto>): Promise<SaveResult> {
  const filename = photo.filename || `wedding-moment-${photo.id}.jpg`;
  if (!photo.key && !photo.pipeline && !photo.src.startsWith("/api/")) return savePhotoToDevice(photo.src, filename);
  const response = await fetch(getOriginalDownloadEndpoint(photo.id), { method: "POST" });
  const result = await response.json() as { url?: string; filename?: string; error?: string };
  if (!response.ok || !result.url) throw new Error(result.error || "Không thể tải ảnh gốc.");
  return savePhotoToDevice(result.url, result.filename || filename);
}

export async function savePhotoToDevice(url:string,filename:string):Promise<SaveResult>{
  const response=await fetch(url);if(!response.ok)throw new Error("Không thể tải ảnh");
  const blob=await response.blob();const safeName=filename.replace(/[\\/\u0000-\u001f\u007f]/g,"-");
  const file=new File([blob],safeName,{type:blob.type||"image/jpeg"});
  const isMobile=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
  if(isMobile&&typeof navigator.share==="function"&&typeof navigator.canShare==="function"&&navigator.canShare({files:[file]})){
    await navigator.share({files:[file],title:"Lưu ảnh cưới",text:"Chọn “Lưu hình ảnh” để thêm ảnh vào thư viện trên điện thoại."});
    return "shared";
  }
  const objectUrl=URL.createObjectURL(blob);const link=document.createElement("a");link.href=objectUrl;link.download=safeName;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);return "downloaded";
}
