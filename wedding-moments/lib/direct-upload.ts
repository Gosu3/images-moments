import { DUPLICATE_UPLOAD_CODE, DuplicateUploadError } from "./upload-duplicates";
type Presign = { mode: "legacy" | "direct"; photoId?: string; ready?: boolean; uploadUrl?: string; headers?: Record<string, string>; error?: string; code?: string };
async function post(url: string, data: unknown) {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  const result = await response.json() as Presign;
  if (!response.ok) {
    if (result.code === DUPLICATE_UPLOAD_CODE) throw new DuplicateUploadError(result.error);
    throw new Error(result.error || "Không thể tải ảnh.");
  }
  return result;
}
export async function uploadDirect(file: File, album: string, uploadId: string, progress: (value: number) => void) {
  const sha256 = [...new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()))].map(b => b.toString(16).padStart(2, "0")).join("");
  const bitmap = await createImageBitmap(file);
  const width = bitmap.width, height = bitmap.height; bitmap.close();
  const input = { album, filename: file.name, contentType: file.type, size: file.size, sha256, uploadId, width, height };
  let ticket = await post("/api/uploads/presign", input);
  if (ticket.mode === "legacy") return false;
  if (ticket.ready) return true;
  for (let attempt = 0; attempt < 2; attempt++) {
    const status = await new Promise<number>((resolve, reject) => {
      const xhr = new XMLHttpRequest(); xhr.open("PUT", ticket.uploadUrl!); xhr.timeout = 180000;
      for (const [name, value] of Object.entries(ticket.headers || {})) xhr.setRequestHeader(name, value);
      xhr.upload.onprogress = e => { if (e.lengthComputable) progress(Math.min(95, Math.round(e.loaded / e.total * 95))); };
      xhr.onload = () => resolve(xhr.status);
      xhr.onerror = () => reject(new Error("Mất kết nối với R2. Kiểm tra CORS rồi thử lại."));
      xhr.ontimeout = () => reject(new Error("Upload hết thời gian. Hãy thử lại."));
      xhr.send(file); // Original File, never a canvas/blob preview.
    });
    if (status >= 200 && status < 300) break;
    if (status === 403 && attempt === 0) { ticket = await post("/api/uploads/presign", input); if (ticket.ready) return true; continue; }
    throw new Error(`R2 không nhận ảnh (${status}).`);
  }
  progress(96);
  await post("/api/uploads/finalize", { photoId: ticket.photoId });
  return true;
}
