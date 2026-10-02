// Browser-side conversion so any image format (HEIC/HEIF from iPhone, GIF,
// BMP, AVIF, TIFF where the browser can decode it) is uploaded as JPEG. The
// server pipeline keeps accepting only JPEG, PNG and WebP.
export const UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp"];
const EXTENSION_TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
// iOS Safari refuses to encode canvases above ~16.7 megapixels.
const MAX_CANVAS_AREA = 16_777_216;
const JPEG_QUALITY = 0.92;

export function isAppleMobile() {
  return typeof navigator !== "undefined" && (/iPad|iPhone|iPod/.test(navigator.userAgent) || navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}
function extension(name: string) { return /\.([^.]+)$/.exec(name)?.[1].toLowerCase() ?? ""; }
// Some systems report an empty type for .jpg/.png/.webp; trust the extension
// there instead of re-encoding (the server still verifies the real bytes).
function directType(file: Pick<File, "name" | "type">) {
  if (UPLOAD_TYPES.includes(file.type)) return file.type;
  return !file.type || file.type === "application/octet-stream" ? EXTENSION_TYPES[extension(file.name)] : undefined;
}
export function needsJpegConversion(file: Pick<File, "name" | "type">) { return !directType(file); }
// Name the photo will have in the library; used for duplicate detection
// before the (slow) conversion runs, e.g. IMG_0001.HEIC -> IMG_0001.jpg.
export function uploadFilename(file: Pick<File, "name" | "type">) {
  if (!needsJpegConversion(file)) return file.name;
  return (file.name.replace(/\.[^./\\]*$/, "") || "anh") + ".jpg";
}

async function decode(file: File): Promise<ImageBitmap> {
  try { return await createImageBitmap(file); } // Safari decodes HEIC natively.
  catch {
    try {
      // Loaded only when needed (~3 MB) for browsers without HEIC support.
      const { heicTo } = await import("heic-to/next");
      return await heicTo({ blob: file, type: "bitmap" });
    } catch { throw new Error(`Không đọc được ${file.name}. File có thể hỏng hoặc không phải ảnh.`); }
  }
}
async function encode(bitmap: ImageBitmap, scale: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.fillStyle = "#fff"; context.fillRect(0, 0, canvas.width, canvas.height); // JPEG has no transparency.
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
  canvas.width = canvas.height = 0; // Release canvas memory early on phones.
  return blob;
}
// Upload workers run in parallel; decoding several 24 MP photos at once can
// exhaust a phone's memory, so conversions run one at a time.
let conversionChain: Promise<unknown> = Promise.resolve();
export async function prepareUploadFile(file: File): Promise<{ file: File; converted: boolean; downscaled: boolean }> {
  const type = directType(file);
  if (type) return { file: type === file.type ? file : new File([file], file.name, { type, lastModified: file.lastModified }), converted: false, downscaled: false };
  const job = conversionChain.then(() => convertToJpeg(file));
  conversionChain = job.catch(() => undefined);
  return job;
}
async function convertToJpeg(file: File) {
  const bitmap = await decode(file);
  try {
    const area = bitmap.width * bitmap.height, fit = Math.sqrt(MAX_CANVAS_AREA / area) * 0.999;
    // An oversized iOS canvas silently renders blank, so shrink up front there.
    let downscaled = isAppleMobile() && area > MAX_CANVAS_AREA;
    let blob = await encode(bitmap, downscaled ? fit : 1);
    if (!blob && !downscaled && area > MAX_CANVAS_AREA) { blob = await encode(bitmap, fit); downscaled = true; }
    if (!blob) throw new Error(`Không thể chuyển ${file.name} sang JPEG trên thiết bị này.`);
    return { file: new File([blob], uploadFilename(file), { type: "image/jpeg", lastModified: file.lastModified }), converted: true, downscaled };
  } finally { bitmap.close(); }
}
