import { libraryError, libraryOwner, LibraryError, mutateLibrary, readLibrary } from "@/lib/library-server";
import { putOriginal } from "@/lib/original-storage";
import { uploadPreview } from "@/lib/cloudflare-images";
import { imagesEnabled } from "@/lib/cloud-config";
import { MAX_ORIGINAL_SIZE, validImageHeader } from "@/lib/image-upload";
import type { LibraryPhoto } from "@/lib/library-model";
import { imagePipelineEnabled } from "@/lib/image-service";

export async function POST(request: Request) {
  try {
    const owner = await libraryOwner(request, true);
    if (imagePipelineEnabled()) throw new LibraryError("Hãy dùng upload trực tiếp R2.", 410);
    if (Number(request.headers.get("content-length")) > 61 * 1024 * 1024) throw new LibraryError("Ảnh vượt quá giới hạn tải lên.", 413);
    const form = await request.formData();
    const file = form.get("file"), preview = form.get("preview");
    const album = String(form.get("album") ?? "");
    const uploadId = String(form.get("uploadId") ?? crypto.randomUUID());
    const width = Number(form.get("width")), height = Number(form.get("height"));
    if (!/^[a-f0-9-]{36}$/i.test(uploadId)) throw new LibraryError("Mã tải lên không hợp lệ.", 400);
    if (!(file instanceof File) || !["image/jpeg", "image/png", "image/webp"].includes(file.type) || !file.size || file.size > MAX_ORIGINAL_SIZE ||
      !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 100000 || height > 100000 ||
      !file.name || file.name.length > 255) throw new LibraryError("Chỉ hỗ trợ JPEG, PNG, WebP tối đa 50 MB.", 400);
    if (!validImageHeader(new Uint8Array(await file.slice(0, 32).arrayBuffer()), file.type)) throw new LibraryError("Nội dung file không khớp định dạng ảnh.", 400);
    const sha256 = [...new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()))].map(b => b.toString(16).padStart(2, "0")).join("");
    const library = await readLibrary(owner);
    if (!library.albums.some(a => a.slug === album)) throw new LibraryError("Album không tồn tại.", 404);
    let photo = library.photos.find(p => p.uploadId === uploadId);
    if (photo && photo.sha256 !== sha256) throw new LibraryError("Mã tải lên đã dùng cho ảnh khác.", 409);
    if (!photo) {
      const id = crypto.randomUUID();
      // Stable object key makes a retried request reuse the original bytes.
      const key = `${encodeURIComponent(owner)}/${uploadId}-${sha256}`;
      const storage = await putOriginal(key, file, sha256);
      const src = `/api/library/photo/${id}`;
      const record: LibraryPhoto = { id, src, preview: src + "?variant=thumbnail", album, filename: file.name, alt: file.name, width, height,
        takenAt: new Date().toISOString(), key, storage, size: file.size, sha256, contentType: file.type, uploadId,
        previewStatus: imagesEnabled() ? "failed" : "disabled" };
      // Never delete an original after an ambiguous database timeout: the write
      // may have committed. Retain orphan objects for manual reconciliation.
      const saved = await mutateLibrary(owner, data => {
        if (!data.albums.some(a => a.slug === album)) throw new LibraryError("Album đã bị xóa.", 409);
        const duplicate = data.photos.find(p => p.uploadId === uploadId);
        if (duplicate && duplicate.sha256 !== sha256) throw new LibraryError("Mã tải lên bị trùng.", 409);
        if (!duplicate) data.photos.push(record);
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
