import { bucket, libraryError, libraryOwner, LibraryError, mutateLibrary, readLibrary } from "@/lib/library-server";
export async function POST(request: Request) {
  let key: string | undefined;
  try {
    const owner = await libraryOwner(request, true);
    if (Number(request.headers.get("content-length")) > 51 * 1024 * 1024) throw new LibraryError("Ảnh vượt quá 50 MB.", 413);
    const form = await request.formData();
    const file = form.get("file");
    const album = String(form.get("album") ?? "");
    const width = Number(form.get("width")), height = Number(form.get("height"));
    if (!(file instanceof File) || !["image/jpeg", "image/png", "image/webp"].includes(file.type) || !file.size || file.size > 50 * 1024 * 1024 || !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new LibraryError("Chỉ hỗ trợ ảnh JPEG, PNG, WebP tối đa 50 MB.", 400);
    if (!(await readLibrary(owner)).albums.some(a => a.slug === album)) throw new LibraryError("Album không tồn tại.", 404);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const valid = file.type === "image/jpeg" ? bytes[0] === 255 && bytes[1] === 216 : file.type === "image/png" ? bytes.slice(0,8).join() === "137,80,78,71,13,10,26,10" : new TextDecoder().decode(bytes.slice(0,4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8,12)) === "WEBP";
    if (!valid) throw new LibraryError("Nội dung file không khớp định dạng ảnh.", 400);
    const id = crypto.randomUUID();
    key = `${encodeURIComponent(owner)}/${id}`;
    await bucket().put(key, bytes, { httpMetadata: { contentType: file.type } });
    const src = `/api/library/photo/${id}`;
    await mutateLibrary(owner, data => {
      if (!data.albums.some(a => a.slug === album)) throw new LibraryError("Album đã bị xóa.", 409);
      data.photos.push({ id, src, preview: src, album, filename: file.name, alt: file.name, width, height, takenAt: new Date().toISOString(), key });
    });
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    if (key) { try { await bucket().delete(key); } catch { /* Retry cleanup separately if storage is unavailable. */ } }
    return libraryError(error);
  }
}
