import { normalizedFilename } from "./upload-duplicates";
import { needsJpegConversion, uploadFilename } from "./convert-image";

export const DUPLICATE_QUEUE_TTL = 5 * 60 * 1000;
export type QueueItem = { id: string; file: File; album: string; progress: number; status: "waiting" | "uploading" | "done" | "failed" | "duplicate"; duplicateAt?: number; error?: string; warning?: string };
export function createQueueItems(files: File[], album: string, photos: { filename: string; status?: string }[], reservations: Map<string, string>, now = Date.now()): QueueItem[] {
  const existing = new Set(photos.filter(p => p.status !== "deleted").map(p => normalizedFilename(p.filename)));
  return files.map(file => {
    const id = crypto.randomUUID(), name = normalizedFilename(uploadFilename(file));
    const base = { id, file, album, progress: 0 };
    if (existing.has(name) || reservations.has(name)) return { ...base, status: "duplicate", duplicateAt: now };
    // Any format is queued; non JPEG/PNG/WebP files are converted to JPEG
    // during upload. Only the size limit of the stored original applies here.
    if (!file.size) return { ...base, status: "failed", error: "File rỗng, không có dữ liệu ảnh." };
    if (!needsJpegConversion(file) && file.size > 50 * 1024 * 1024) return { ...base, status: "failed", error: "Ảnh vượt quá 50 MB." };
    reservations.set(name, id);
    return { ...base, status: "waiting" };
  });
}
export function pruneDuplicateQueue(queue: QueueItem[], now = Date.now()) {
  const remaining = queue.filter(item => item.status !== "duplicate" || (item.duplicateAt ?? now) + DUPLICATE_QUEUE_TTL > now);
  return remaining.length === queue.length ? queue : remaining;
}
