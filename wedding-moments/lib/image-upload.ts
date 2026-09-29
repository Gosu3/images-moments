export const MAX_ORIGINAL_SIZE = 50 * 1024 * 1024;
// Vercel Functions reject request bodies above 4.5 MB. Keep enough room for
// multipart form fields while direct-to-R2 uploads are not enabled.
export const MAX_PROXY_UPLOAD_SIZE = Math.floor(3.75 * 1024 * 1024);

export function validImageHeader(bytes: Uint8Array, type: string) {
  if (type === "image/jpeg") return bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (type === "image/png") return bytes.length >= 24 && bytes.slice(0, 8).join() === "137,80,78,71,13,10,26,10";
  return type === "image/webp" && bytes.length >= 16 && new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(
    blob => blob ? resolve(blob) : reject(new Error("Không thể tối ưu ảnh.")), type, quality,
  ));
}

export async function prepareUpload(file: File, createPreview = true, optimizeForProxy = false) {
  const bitmap = await createImageBitmap(file);
  try {
    let width = bitmap.width, height = bitmap.height;
    let uploadFile = file, optimized = false;
    if (optimizeForProxy && file.size > MAX_PROXY_UPLOAD_SIZE) {
      let ratio = Math.min(1, 3840 / Math.max(width, height));
      let blob: Blob | undefined;
      for (let pass = 0; pass < 7; pass++) {
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
        canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
        const context = canvas.getContext("2d", { alpha: file.type !== "image/jpeg" });
        if (!context) throw new Error("Không thể tối ưu ảnh.");
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        blob = await canvasBlob(canvas, "image/webp", Math.max(.58, .88 - pass * .05));
        width = canvas.width; height = canvas.height;
        if (blob.size <= MAX_PROXY_UPLOAD_SIZE) break;
        ratio *= Math.max(.68, Math.min(.88, Math.sqrt(MAX_PROXY_UPLOAD_SIZE / blob.size) * .94));
      }
      if (!blob || blob.size > MAX_PROXY_UPLOAD_SIZE) throw new Error("Ảnh quá phức tạp để tối ưu dưới giới hạn Vercel.");
      const base = file.name.replace(/\.[^.]+$/, "") || "photo";
      uploadFile = new File([blob], `${base}.webp`, { type: "image/webp", lastModified: file.lastModified });
      optimized = true;
    }
    let preview: File | undefined;
    if (createPreview) {
      const ratio = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
      canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Không thể tạo ảnh xem trước.");
      context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      preview = new File([await canvasBlob(canvas, "image/jpeg", .85)], "preview.jpg", { type: "image/jpeg" });
    }
    return { width, height, preview, uploadFile, optimized };
  } finally { bitmap.close(); }
}
