import { z } from "zod";
import { LibraryError, mutateLibrary, readLibrary } from "./library-server";
import { imagePipelineEnabled, imageServiceCall, originalsBucket, type ProcessedImage } from "./image-service";
import { createR2SignedUrl } from "./r2-presign";
import { UPLOAD_TTL } from "./image-protocol";
import type { LibraryPhoto } from "./library-model";
import { directR2Enabled } from "./cloud-config";
import { headOriginal, removeUncommittedOriginal } from "./original-storage";
import { galleryVariantKey } from "./gallery-preview";

export const uploadRequest = z.object({ album: z.string().min(1).max(100), filename: z.string().min(1).max(255),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]), size: z.number().int().positive().max(50 * 1024 * 1024),
  sha256: z.string().regex(/^[a-f0-9]{64}$/), uploadId: z.string().uuid(),
  width: z.number().int().positive().max(100000), height: z.number().int().positive().max(100000) });
export async function beginUpload(owner: string, body: unknown) {
  if (!imagePipelineEnabled() && !directR2Enabled()) return { mode: "legacy" as const };
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
      const workerPipeline = imagePipelineEnabled();
      photo = { id, album: input.album, filename: input.filename, alt: input.filename, src: "", preview: "", takenAt: now,
        width: input.width, height: input.height, key: `albums/${namespace}/${id}.${ext}`,
        previewKey: workerPipeline ? `albums/${namespace}/${id}.jpg` : undefined,
        stagingKey: workerPipeline ? `uploads/${namespace}/${id}.${ext}` : undefined,
        pipeline: workerPipeline ? "r2-v2" : "r2-direct", storage: "s3", status: "pending", size: input.size, sha256: input.sha256, contentType: input.contentType,
        uploadId: input.uploadId, createdAt: now, updatedAt: now };
      data.photos.push(photo);
    }
    if (photo.status !== "ready") {
      photo.uploadExpiresAt = new Date(Date.now() + UPLOAD_TTL * 1000).toISOString(); photo.updatedAt = now;
    }
  });
  const photo = library.photos.find(p => p.uploadId === input.uploadId)!;
  if (photo.status === "ready") return { mode: "direct" as const, photoId: photo.id, ready: true };
  const uploadUrl = await createR2SignedUrl({ method: "PUT", key: photo.pipeline === "r2-v2" ? photo.stagingKey! : photo.key!, contentType: photo.contentType,
    expires: UPLOAD_TTL, bucketName: photo.pipeline === "r2-v2" ? originalsBucket() : undefined });
  if (!uploadUrl) throw new LibraryError("Chưa cấu hình R2 upload.");
  return { mode: "direct" as const, photoId: photo.id, uploadUrl, headers: { "Content-Type": photo.contentType! }, expiresIn: UPLOAD_TTL };
}

export async function finalizeUpload(owner: string, id: string) {
  const token = crypto.randomUUID();
  const library = await mutateLibrary(owner, data => {
    const photo = data.photos.find(p => p.id === id && (p.pipeline === "r2-v2" || p.pipeline === "r2-direct"));
    if (!photo || photo.status === "deleted") throw new LibraryError("Không tìm thấy ảnh.", 404);
    if (photo.status === "ready") return;
    if (Date.parse(photo.processingUntil || "") > Date.now()) throw new LibraryError("Ảnh đang được xử lý.", 409);
    photo.status = "processing"; photo.processingToken = token;
    photo.processingUntil = new Date(Date.now() + 5 * 60000).toISOString(); photo.updatedAt = new Date().toISOString();
  });
  const photo = library.photos.find(p => p.id === id)!;
  if (photo.status === "ready") return photo;
  try {
    let result: Partial<ProcessedImage> = {};
    if (photo.pipeline === "r2-v2") {
      result = await imageServiceCall<ProcessedImage>("process", { key: photo.key, previewKey: photo.previewKey, stagingKey: photo.stagingKey,
        size: photo.size, sha256: photo.sha256, contentType: photo.contentType });
    } else {
      // The browser already uploaded the original directly to R2. Finalization
      // must stay lightweight: Vercel should not download and transform the
      // complete file before it can appear in the library. Gallery variants
      // are generated once and persisted by the photo route on first access.
      const object = await headOriginal(photo);
      if (!Number.isFinite(object.size) || object.size !== photo.size || object.contentType !== photo.contentType) {
        throw new LibraryError("File trên R2 không khớp dung lượng hoặc định dạng đã chọn.", 422);
      }
    }
    const saved = await mutateLibrary(owner, data => {
      const target = data.photos.find(p => p.id === id);
      if (!target || target.status === "deleted" || target.processingToken !== token) throw new LibraryError("Trạng thái ảnh đã thay đổi.", 409);
      Object.assign(target, result, { status: "ready", updatedAt: new Date().toISOString(), error: undefined, processingToken: undefined, processingUntil: undefined });
    });
    return saved.photos.find(p => p.id === id)!;
  } catch (error) {
    await mutateLibrary(owner, data => {
      const target = data.photos.find(p => p.id === id);
      if (target?.processingToken === token && target.status !== "deleted") {
        target.status = "failed";
        target.error = error instanceof Error ? error.message : "Xử lý ảnh thất bại; có thể thử lại.";
        if (target.pipeline === "r2-direct") {
          target.processingToken = undefined;
          target.processingUntil = undefined;
        }
      }
      // Keep lease until expiry, even after timeout: a remote job might still be
      // finishing. Cleanup must not race with that job.
    }).catch(() => undefined);
    throw error;
  }
}

export async function cleanupPhotos(owner: string) {
  const library = await readLibrary(owner);
  const jobs = library.photos.filter(p => (p.pipeline === "r2-v2" || p.pipeline === "r2-direct" || p.migrationTarget) && !p.cleanupComplete && p.status === "deleted" && Date.parse(p.cleanupAfter || "") <= Date.now()).slice(0, 20);
  let removed = 0;
  for (const photo of jobs) {
    try {
      if (photo.pipeline === "r2-direct") {
        await Promise.all([photo.key!, galleryVariantKey(photo, "thumbnail"), galleryVariantKey(photo, "preview")]
          .map(key => removeUncommittedOriginal(key, "s3").catch(error => { if (!String(error).includes("404")) throw error; })));
      } else {
        await imageServiceCall("delete", photo.pipeline === "r2-v2" ? { key: photo.key, previewKey: photo.previewKey, stagingKey: photo.stagingKey } : photo.migrationTarget);
      }
      await mutateLibrary(owner, data => {
        const target = data.photos.find(p => p.id === photo.id && p.status === "deleted");
        if (target && (target.legacySource || target.pipeline !== "r2-v2" && target.pipeline !== "r2-direct")) target.cleanupComplete = true;
        else data.photos = data.photos.filter(p => p.id !== photo.id || p.status !== "deleted");
      });
      removed++;
    } catch { /* Retain durable tombstone and retry on the next cleanup run. */ }
  }
  return { removed, pending: (await readLibrary(owner)).photos.filter(p => p.status === "deleted" && !p.cleanupComplete && (p.pipeline === "r2-v2" || p.pipeline === "r2-direct" || p.migrationTarget)).length };
}
export function markDeleted(photo: LibraryPhoto) {
  photo.status = "deleted"; photo.deletedAt = new Date().toISOString();
  // Signed PUTs are reusable until expiry; leave time for in-flight processing.
  photo.cleanupAfter = new Date(Math.max(Date.now(), Date.parse(photo.uploadExpiresAt || "") || 0, Date.parse(photo.processingUntil || "") || 0) + 5 * 60000).toISOString();
}
