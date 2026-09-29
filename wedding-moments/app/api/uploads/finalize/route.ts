import { libraryError, libraryOwner, LibraryError } from "@/lib/library-server";
import { finalizeUpload } from "@/lib/image-lifecycle";
import { z } from "zod";
export async function POST(request: Request) {
  try {
    const owner = await libraryOwner(request, true);
    const input = z.object({ photoId: z.string().uuid() }).safeParse(await request.json());
    if (!input.success) throw new LibraryError("Mã ảnh không hợp lệ.", 400);
    const photo = await finalizeUpload(owner, input.data.photoId);
    return Response.json({ id: photo.id, status: photo.status }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return libraryError(error); }
}
