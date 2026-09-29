import { createHash } from "node:crypto";
import { readLibrary, mutateLibrary, LibraryError } from "./library-server";
import { getOriginal } from "./original-storage";
import { imageServiceCall, originalsBucket, type ProcessedImage } from "./image-service";
import { createR2SignedUrl } from "./r2-presign";
import { validImageHeader, MAX_ORIGINAL_SIZE } from "./image-upload";

export async function migrationInventory(owner: string) {
  const { photos } = await readLibrary(owner);
  return { total: photos.length, demo: photos.filter(p => p.demo).length, migrated: photos.filter(p => p.pipeline === "r2-v2").length,
    photos: photos.filter(p => !p.demo && p.status !== "deleted" && p.key && p.pipeline !== "r2-v2").map(p => ({ id: p.id, storage: p.storage ?? "binding", hasHostedPreview: !!p.imageId })) };
}

export async function migratePhoto(owner: string, id: string) {
  const migrationId = crypto.randomUUID(), token = crypto.randomUUID();
  const initial = (await readLibrary(owner)).photos.find(p => p.id === id);
  if (!initial || initial.status === "deleted" || initial.demo || !initial.key) throw new LibraryError("Ảnh không phù hợp migration.", 400);
  if (initial.pipeline === "r2-v2") return { id, status: "already-migrated" };
  const namespace = createHash("sha256").update(owner + "\n" + initial.album).digest("hex").slice(0, 32);
  if (Date.parse(initial.processingUntil || "") > Date.now()) throw new LibraryError("Ảnh đang được xử lý.", 409);
  // Infer content from bytes, not a possibly missing legacy filename/type.
  const original = await getOriginal(initial);
  if (!original.body) throw new LibraryError("Không đọc được original.");
  const hash = createHash("sha256"); const reader = original.body.getReader();
  let size = 0, header = new Uint8Array(0);
  while (true) {
    const part = await reader.read(); if (part.done) break;
    size += part.value.length;
    if (size > MAX_ORIGINAL_SIZE) { await reader.cancel(); throw new LibraryError("Original vượt giới hạn 50 MB.", 413); }
    if (header.length < 32) { const next = new Uint8Array(Math.min(32, header.length + part.value.length)); next.set(header); next.set(part.value.slice(0, next.length - header.length), header.length); header = next; }
    hash.update(part.value);
  }
  const contentType = ["image/jpeg", "image/png", "image/webp"].find(type => validImageHeader(header, type));
  if (!contentType) throw new LibraryError("Original không phải định dạng hỗ trợ.", 400);
  const sha256 = hash.digest("hex"), ext = contentType === "image/jpeg" ? "jpg" : contentType.split("/")[1];
  if (initial.sha256 && initial.sha256 !== sha256) throw new LibraryError("Checksum original cũ không khớp.", 409);
  const claimed = await mutateLibrary(owner, data => {
    const photo = data.photos.find(p => p.id === id);
    if (!photo || photo.status === "deleted" || photo.pipeline === "r2-v2" || Date.parse(photo.processingUntil || "") > Date.now()) throw new LibraryError("Trạng thái ảnh thay đổi.", 409);
    photo.migrationTarget ??= { key: `albums/${namespace}/${migrationId}.${ext}`, previewKey: `albums/${namespace}/${migrationId}.jpg`, stagingKey: `uploads/${namespace}/${migrationId}.${ext}` };
    photo.processingToken = token; photo.processingUntil = new Date(Date.now() + 5 * 60000).toISOString();
  });
  const target = claimed.photos.find(p => p.id === id)!.migrationTarget!;
  const url = await createR2SignedUrl({ method: "PUT", key: target.stagingKey, bucketName: originalsBucket(), contentType, expires: 300 });
  if (!url) throw new LibraryError("Chưa cấu hình bucket migration.");
  // Only migration streams an existing legacy object through the app. New
  // browser uploads always go directly to R2.
  const source = await getOriginal(initial);
  const copied = await fetch(url, { method: "PUT", headers: { "Content-Type": contentType, "Content-Length": String(size) }, body: source.body, signal: AbortSignal.timeout(120000) });
  if (!copied.ok) throw new LibraryError("Copy original thất bại.");
  await copied.body?.cancel();
  const result = await imageServiceCall<ProcessedImage>("process", { ...target, size, sha256, contentType });
  if (result.sha256 !== sha256 || result.size !== size) throw new LibraryError("Xác minh migration thất bại.");
  await mutateLibrary(owner, data => {
    const photo = data.photos.find(p => p.id === id);
    if (!photo || photo.status === "deleted" || photo.processingToken !== token) throw new LibraryError("Trạng thái ảnh thay đổi.", 409);
    photo.legacySource = { key: photo.key, storage: photo.storage ?? "binding", imageId: photo.imageId, src: photo.src, preview: photo.preview };
    Object.assign(photo, target, result, { pipeline: "r2-v2", storage: "s3", status: "ready", src: "", preview: "", updatedAt: new Date().toISOString(), processingToken: undefined, processingUntil: undefined, migrationTarget: undefined });
  });
  return { id, status: "migrated", sha256 };
}
