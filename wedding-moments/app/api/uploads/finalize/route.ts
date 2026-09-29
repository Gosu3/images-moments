import { libraryError, libraryOwner, LibraryError } from "@/lib/library-server";
import { finalizeUpload } from "@/lib/image-lifecycle";
import { z } from "zod";
import { after } from "next/server";
import { prepareGalleryPreviews } from "@/lib/gallery-preview";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    const owner = await libraryOwner(request, true);
    const input = z.object({ photoId: z.string().uuid() }).safeParse(await request.json());
    if (!input.success) throw new LibraryError("Mã ảnh không hợp lệ.", 400);
    const photo = await finalizeUpload(owner, input.data.photoId);
    if (photo.pipeline === "r2-direct") after(async () => {
      try { await prepareGalleryPreviews(photo); }
      catch { console.warn("Gallery preview warmup failed", { photoId: photo.id }); }
    });
    return Response.json({ id: photo.id, status: photo.status }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return libraryError(error); }
}
