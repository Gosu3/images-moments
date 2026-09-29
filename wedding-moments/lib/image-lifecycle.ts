import { z } from "zod";
import { LibraryError, mutateLibrary, readLibrary } from "./library-server";
import { imagePipelineEnabled, imageServiceCall, originalsBucket, type ProcessedImage } from "./image-service";
import { createR2SignedUrl } from "./r2-presign";
import { UPLOAD_TTL } from "./image-protocol";
import type { LibraryPhoto } from "./library-model";

export const uploadRequest = z.object({ album: z.string().min(1).max(100), filename: z.string().min(1).max(255),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]), size: z.number().int().positive().max(50 * 1024 * 1024),
  sha256: z.string().regex(/^[a-f0-9]{64}$/), uploadId: z.string().uuid() });
export async function beginUpload(owner: string, body: unknown) {
  if (!imagePipelineEnabled()) return { mode: "legacy" as const };
  const parsed = uploadRequest.safeParse(body);
  if (!parsed.success) throw new LibraryError("Thông tin ảnh không hợp lệ.", 400);
  const input = parsed.data;
  const namespace = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(owner + "\n" + input.album)))].map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
  const id = crypto.randomUUID(), ext = input.contentType === "image/jpeg" ? "jpg" : input.contentType.split("/")[1];
  const now = new Date().toISOString();
  const library = await mutateLibrary(owner, data => {
    if (!data.albums.some(a => a.slug === input.album)) throw new LibraryError("Album không tồn tại.", 404);
    let photo = data.photos.find(p => p.uploadId === input.uploadId);
    if (photo) {
      if (photo.sha256 !== input.sha256 || photo.size !== input.size || photo.contentType !== input.contentType || photo.album !== input.album || photo.filename !== input.filename) throw new LibraryError("Mã tải lên không khớp ảnh.", 409);
      if (photo.status === "deleted") throw new LibraryError("Ảnh đã bị xóa.", 410);
      if (Date.parse(photo.processingUntil || "") > Date.now()) throw new LibraryError("Ảnh đang được xử lý. Hãy thử lại sau.", 409);
    } else {
      photo = { id, album: input.album, filename: input.filename, alt: input.filename, src: "", preview: "", takenAt: now,
        width: 0, height: 0, key: `albums/${namespace}/${id}.${ext}`, previewKey: `albums/${namespace}/${id}.jpg`, stagingKey: `uploads/${namespace}/${id}.${ext}`,
        pipeline: "r2-v2", storage: "s3", status: "pending", size: input.size, sha256: input.sha256, contentType: input.contentType,
        uploadId: input.uploadId, createdAt: now, updatedAt: now };
      data.photos.push(photo);
    }
    if (photo.status !== "ready") {
      photo.uploadExpiresAt = new Date(Date.now() + UPLOAD_TTL * 1000).toISOString(); photo.updatedAt = now;
    }
  });
  const photo = library.photos.find(p => p.uploadId === input.uploadId)!;
  if (photo.status === "ready") return { mode: "direct" as const, photoId: photo.id, ready: true };
  const uploadUrl = await createR2SignedUrl({ method: "PUT", key: photo.stagingKey!, contentType: photo.contentType, expires: UPLOAD_TTL, bucketName: originalsBucket() });
  if (!uploadUrl) throw new LibraryError("Chưa cấu hình R2 upload.");
  return { mode: "direct" as const, photoId: photo.id, uploadUrl, headers: { "Content-Type": photo.contentType! }, expiresIn: UPLOAD_TTL };
}

export async function finalizeUpload(owner: string, id: string) {
  const token = crypto.randomUUID();
  const library = await mutateLibrary(owner, data => {
    const photo = data.photos.find(p => p.id === id && p.pipeline === "r2-v2");
    if (!photo || photo.status === "deleted") throw new LibraryError("Không tìm thấy ảnh.", 404);
    if (photo.status === "ready") return;
    if (Date.parse(photo.processingUntil || "") > Date.now()) throw new LibraryError("Ảnh đang được xử lý.", 409);
    photo.status = "processing"; photo.processingToken = token;
    photo.processingUntil = new Date(Date.now() + 5 * 60000).toISOString(); photo.updatedAt = new Date().toISOString();
  });
  const photo = library.photos.find(p => p.id === id)!;
  if (photo.status === "ready") return photo;
  try {
    const result = await imageServiceCall<ProcessedImage>("process", { key: photo.key, previewKey: photo.previewKey, stagingKey: photo.stagingKey,
      size: photo.size, sha256: photo.sha256, contentType: photo.contentType });
    const saved = await mutateLibrary(owner, data => {
      const target = data.photos.find(p => p.id === id);
      if (!target || target.status === "deleted" || target.processingToken !== token) throw new LibraryError("Trạng thái ảnh đã thay đổi.", 409);
      Object.assign(target, result, { status: "ready", updatedAt: new Date().toISOString(), error: undefined, processingToken: undefined, processingUntil: undefined });
    });
    return saved.photos.find(p => p.id === id)!;
  } catch (error) {
    await mutateLibrary(owner, data => {
      const target = data.photos.find(p => p.id === id);
      if (target?.processingToken === token && target.status !== "deleted") { target.status = "failed"; target.error = "Xử lý ảnh thất bại; có thể thử lại."; }
      // Keep lease until expiry, even after timeout: a remote job might still be
      // finishing. Cleanup must not race with that job.
    }).catch(() => undefined);
    throw error;
  }
}

export async function cleanupPhotos(owner: string) {
  const library = await readLibrary(owner);
  const jobs = library.photos.filter(p => (p.pipeline === "r2-v2" || p.migrationTarget) && !p.cleanupComplete && p.status === "deleted" && Date.parse(p.cleanupAfter || "") <= Date.now()).slice(0, 20);
  let removed = 0;
  for (const photo of jobs) {
    try {
      await imageServiceCall("delete", photo.pipeline === "r2-v2" ? { key: photo.key, previewKey: photo.previewKey, stagingKey: photo.stagingKey } : photo.migrationTarget);
      await mutateLibrary(owner, data => {
        const target = data.photos.find(p => p.id === photo.id && p.status === "deleted");
        if (target && (target.legacySource || target.pipeline !== "r2-v2")) target.cleanupComplete = true;
        else data.photos = data.photos.filter(p => p.id !== photo.id || p.status !== "deleted");
      });
      removed++;
    } catch { /* Retain durable tombstone and retry on the next cleanup run. */ }
  }
  return { removed, pending: (await readLibrary(owner)).photos.filter(p => p.status === "deleted" && !p.cleanupComplete && (p.pipeline === "r2-v2" || p.migrationTarget)).length };
}
export function markDeleted(photo: LibraryPhoto) {
  photo.status = "deleted"; photo.deletedAt = new Date().toISOString();
  // Signed PUTs are reusable until expiry; leave time for in-flight processing.
  photo.cleanupAfter = new Date(Math.max(Date.now(), Date.parse(photo.uploadExpiresAt || "") || 0, Date.parse(photo.processingUntil || "") || 0) + 5 * 60000).toISOString();
}
