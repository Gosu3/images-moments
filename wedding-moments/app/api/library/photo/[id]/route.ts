import { libraryError, libraryOwner, LibraryError, readLibrary } from "@/lib/library-server";
import { getOriginal } from "@/lib/original-storage";
import { signedPreviewUrl } from "@/lib/cloudflare-images";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const owner = await libraryOwner(request);
    const { id } = await params;
    const photo = (await readLibrary(owner)).photos.find(p => p.id === id);
    if (!photo?.key) throw new LibraryError("Không tìm thấy ảnh.", 404);
    if (new URL(request.url).searchParams.get("variant") === "thumbnail" && photo.imageId) {
      try {
        return new Response(null, { status: 302, headers: { Location: await signedPreviewUrl(photo.imageId), "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
      } catch { /* Keep the original available if preview configuration is missing. */ }
    }
    const object = await getOriginal(photo);
    const headers = new Headers({ "Content-Type": photo.contentType ?? object.headers.get("content-type") ?? "application/octet-stream", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
    if (object.headers.has("content-length")) headers.set("Content-Length", object.headers.get("content-length")!);
    if (photo.sha256) headers.set("X-Original-SHA256", photo.sha256);
    return new Response(object.body, { headers });
  } catch (error) { return libraryError(error); }
}
