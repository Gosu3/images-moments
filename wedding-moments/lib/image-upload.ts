export const MAX_ORIGINAL_SIZE = 50 * 1024 * 1024;

export function validImageHeader(bytes: Uint8Array, type: string) {
  if (type === "image/jpeg") return bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (type === "image/png") return bytes.length >= 24 && bytes.slice(0, 8).join() === "137,80,78,71,13,10,26,10";
  return type === "image/webp" && bytes.length >= 16 && new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
}

// Only the preview is resized/re-encoded. The File used for the original upload
// is never replaced, so EXIF, colour data and original bytes remain intact.
export async function prepareUpload(file: File, createPreview = true) {
  const bitmap = await createImageBitmap(file);
  try {
    const width = bitmap.width, height = bitmap.height;
    if (!createPreview) return { width, height, preview: undefined };
    const ratio = Math.min(1, 2400 / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Không thể tạo ảnh xem trước.");
    context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error("Không thể tạo ảnh xem trước.")), "image/jpeg", .85));
    return { width, height, preview: new File([blob], "preview.jpg", { type: "image/jpeg" }) };
  } finally { bitmap.close(); }
}
