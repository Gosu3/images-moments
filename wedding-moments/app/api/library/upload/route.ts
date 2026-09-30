import { libraryError, libraryOwner, LibraryError, mutateLibrary } from "@/lib/library-server";
import { putOriginal } from "@/lib/original-storage";
import { uploadPreview } from "@/lib/cloudflare-images";
import { imagesEnabled } from "@/lib/cloud-config";
import { MAX_ORIGINAL_SIZE, validImageHeader } from "@/lib/image-upload";
import type { LibraryPhoto } from "@/lib/library-model";
import { imagePipelineEnabled } from "@/lib/image-service";
import { directR2Enabled } from "@/lib/cloud-config";
import { DUPLICATE_UPLOAD_CODE, findDuplicatePhoto } from "@/lib/upload-duplicates";

export async function POST(request: Request) {
  try {
    const owner = await libraryOwner(request, true);
    if (imagePipelineEnabled() || directR2Enabled()) throw new LibraryError("Hãy dùng upload trực tiếp R2.", 410);
    if (Number(request.headers.get("content-length")) > 61 * 1024 * 1024) throw new LibraryError("Ảnh vượt quá giới hạn tải lên.", 413);
    const form = await request.formData();
    const file = form.get("file"), preview = form.get("preview");
    const filename = String(form.get("originalFilename") ?? (file instanceof File ? file.name : ""));
    const album = String(form.get("album") ?? "");
    const uploadId = String(form.get("uploadId") ?? crypto.randomUUID());
    const width = Number(form.get("width")), height = Number(form.get("height"));
    if (!/^[a-f0-9-]{36}$/i.test(uploadId)) throw new LibraryError("Mã tải lên không hợp lệ.", 400);
    if (!(file instanceof File) || !["image/jpeg", "image/png", "image/webp"].includes(file.type) || !file.size || file.size > MAX_ORIGINAL_SIZE ||
      !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 100000 || height > 100000 ||
      !file.name || file.name.length > 255 || !filename.trim() || filename.length > 255) throw new LibraryError("Chỉ hỗ trợ JPEG, PNG, WebP tối đa 50 MB.", 400);
    if (!validImageHeader(new Uint8Array(await file.slice(0, 32).arrayBuffer()), file.type)) throw new LibraryError("Nội dung file không khớp định dạng ảnh.", 400);
    const sha256 = [...new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()))].map(b => b.toString(16).padStart(2, "0")).join("");
    const id = crypto.randomUUID(), key = `${encodeURIComponent(owner)}/${uploadId}-${sha256}`;
    const src = `/api/library/photo/${id}`;
    // Reserve the filename atomically before writing any bytes to storage.
    // Concurrent tabs cannot both upload a new original with the same name.
    const reserved = await mutateLibrary(owner, data => {
      if (!data.albums.some(a => a.slug === album)) throw new LibraryError("Album không tồn tại.", 404);
      const existing = data.photos.find(p => p.uploadId === uploadId);
      if (existing) {
        if (existing.status === "deleted") throw new LibraryError("Ảnh đã bị xóa.", 410);
        if (existing.sha256 !== sha256 || existing.album !== album || existing.filename !== filename) throw new LibraryError("Mã tải lên đã dùng cho ảnh khác.", 409);
        return;
      }
      if (findDuplicatePhoto(data.photos, filename)) throw new LibraryError("Ảnh trùng tên đã có trong thư viện.", 409, DUPLICATE_UPLOAD_CODE);
      const record: LibraryPhoto = { id, src, preview: src + "?variant=thumbnail", album, filename, alt: filename, width, height,
        takenAt: new Date().toISOString(), key, size: file.size, sha256, contentType: file.type, uploadId, status: "pending",
        previewStatus: imagesEnabled() ? "failed" : "disabled" };
      data.photos.push(record);
    });
    let photo = reserved.photos.find(p => p.uploadId === uploadId)!;
    if (photo.status === "pending" || photo.status === "failed") {
      const storage = await putOriginal(photo.key!, file, sha256);
      const saved = await mutateLibrary(owner, data => {
        const target = data.photos.find(p => p.uploadId === uploadId);
        if (!target || target.status === "deleted") throw new LibraryError("Ảnh đã bị xóa.", 410);
        Object.assign(target, { storage, status: "ready", updatedAt: new Date().toISOString() });
      });
      photo = saved.photos.find(p => p.uploadId === uploadId)!;
    }
    let warning: string | undefined;
    if (imagesEnabled() && !photo.imageId) {
      try {
        const candidate = preview instanceof File ? preview : file;
        if (candidate.size > 10 * 1024 * 1024 || !validImageHeader(new Uint8Array(await candidate.slice(0, 32).arrayBuffer()), candidate.type)) throw new Error("Invalid preview");
        const imageId = await uploadPreview(candidate);
        if (imageId) await mutateLibrary(owner, data => {
          const target = data.photos.find(p => p.id === photo!.id);
          if (!target) throw new LibraryError("Ảnh đã bị xóa khỏi thư viện.", 409);
          target.imageId = imageId; target.previewStatus = "ready";
        });
      } catch {
        // The original is already durable. Preview failure must not lose it or
        // trigger another original upload when the admin retries this queue item.
        warning = "Ảnh gốc đã lưu. Chưa tạo được bản Cloudflare Images; có thể thử lại.";
      }
    }
    return Response.json({ id: photo.id, sha256, warning }, { status: 201 });
  } catch (error) { return libraryError(error); }
}
