import { z } from "zod";
import { libraryError, libraryOwner, LibraryError, mutateLibrary, readLibrary } from "@/lib/library-server";
import { markDeleted } from "@/lib/image-lifecycle";
const operation = z.discriminatedUnion("action", [
  z.object({ action: z.literal("album"), slug: z.string().min(1).max(100), name: z.string().trim().min(1).max(100), time: z.string().max(100) }),
  z.object({ action: z.literal("deleteAlbum"), slug: z.string() }),
  z.object({ action: z.literal("deletePhotos"), ids: z.array(z.string()).min(1).max(2000) }),
  z.object({ action: z.literal("movePhotos"), ids: z.array(z.string()).min(1).max(2000), album: z.string() }),
  z.object({ action: z.literal("settings"), adminName: z.string().trim().min(1).max(100), title: z.string().trim().min(1).max(150) }),
]);
export async function GET(request: Request) {
  try { return Response.json(await readLibrary(await libraryOwner(request)), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return libraryError(error); }
}
export async function POST(request: Request) {
  try {
    const owner = await libraryOwner(request, true);
    const body = await request.json();
    const parsed = operation.safeParse(body);
    const revision = z.object({ revision: z.number().int().nonnegative() }).safeParse(body);
    if (!parsed.success || !revision.success) throw new LibraryError("Thông tin không hợp lệ.", 400);
    const op = parsed.data;
    const library = await mutateLibrary(owner, data => {
      if (op.action === "album") {
        const existing = data.albums.find(a => a.slug === op.slug);
        if (existing) Object.assign(existing, { name: op.name, time: op.time });
        else data.albums.push({ slug: op.slug, name: op.name, time: op.time });
      } else if (op.action === "deleteAlbum") {
        if (data.photos.some(p => p.album === op.slug && p.status !== "deleted")) throw new LibraryError("Hãy chuyển hoặc xóa ảnh trước khi xóa album.", 400);
        data.albums = data.albums.filter(a => a.slug !== op.slug);
      } else if (op.action === "deletePhotos") {
        // Preserve a durable cleanup record. Never lose object keys before
        // physical deletion succeeds. Legacy originals are retained for migration.
        data.photos.forEach(p => { if (op.ids.includes(p.id) && p.status !== "deleted") markDeleted(p); });
      } else if (op.action === "movePhotos") {
        if (!data.albums.some(a => a.slug === op.album)) throw new LibraryError("Album không tồn tại.", 404);
        data.photos = data.photos.map(p => op.ids.includes(p.id) ? { ...p, album: op.album } : p);
      } else data.settings = { adminName: op.adminName, title: op.title };
    }, revision.data.revision);
    return Response.json(library);
  } catch (error) { return libraryError(error); }
}
