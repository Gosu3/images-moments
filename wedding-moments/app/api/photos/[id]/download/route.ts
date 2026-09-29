import { libraryError, LibraryError, readSharedLibrary } from "@/lib/library-server";
import { createR2SignedUrl } from "@/lib/r2-presign";
import { originalsBucket } from "@/lib/image-service";
import { DOWNLOAD_TTL } from "@/lib/image-protocol";
import { getOriginal } from "@/lib/original-storage";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const found = (await readSharedLibrary(request)).photos.find(p => p.id === id && p.status !== "deleted");
    if (!found?.key || found.status && found.status !== "ready") throw new LibraryError("Không tìm thấy ảnh gốc.", 404);
    if ((found.storage ?? "binding") === "binding") return Response.json({ url: `/api/photos/${encodeURIComponent(id)}/download`, filename: found.filename }, { headers: { "Cache-Control": "no-store" } });
    const url = await createR2SignedUrl({ method: "GET", key: found.key, expires: DOWNLOAD_TTL, filename: found.filename,
      bucketName: found.pipeline === "r2-v2" ? originalsBucket() : undefined });
    if (!url) throw new LibraryError("Chưa cấu hình R2 download.");
    return Response.json({ url, filename: found.filename, expiresIn: DOWNLOAD_TTL }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return libraryError(error); }
}
// Authenticated legacy binding only; new originals never pass through this route.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const photo = (await readSharedLibrary(request)).photos.find(p => p.id === id);
    if (!photo?.key || photo.status && photo.status !== "ready" || photo.pipeline === "r2-v2") throw new LibraryError("Không tìm thấy ảnh gốc.", 404);
    const object = await getOriginal(photo);
    return new Response(object.body, { headers: { "Content-Type": photo.contentType || object.headers.get("content-type") || "application/octet-stream",
      "Cache-Control": "private, no-store", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(photo.filename)}` } });
  } catch (error) { return libraryError(error); }
}
