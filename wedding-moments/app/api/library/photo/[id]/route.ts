import { bucket, libraryError, libraryOwner, LibraryError, readLibrary } from "@/lib/library-server";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const owner = await libraryOwner(request);
    const { id } = await params;
    const photo = (await readLibrary(owner)).photos.find(p => p.id === id);
    if (!photo?.key) throw new LibraryError("Không tìm thấy ảnh.", 404);
    const object = await bucket().get(photo.key);
    if (!object) throw new LibraryError("Không tìm thấy ảnh.", 404);
    return new Response(object.body as ReadableStream, { headers: { "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream", "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return libraryError(error); }
}
