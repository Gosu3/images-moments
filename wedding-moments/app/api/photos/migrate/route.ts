import { libraryError, libraryOwner, LibraryError } from "@/lib/library-server";
import { migrationInventory, migratePhoto } from "@/lib/image-migration";
import { z } from "zod";
export async function GET(request: Request) {
  try { return Response.json(await migrationInventory(await libraryOwner(request)), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return libraryError(error); }
}
export async function POST(request: Request) {
  try {
    const owner = await libraryOwner(request, true);
    const input = z.object({ id: z.string().min(1).max(100), dryRun: z.boolean().default(true) }).safeParse(await request.json());
    if (!input.success) throw new LibraryError("Yêu cầu migration không hợp lệ.", 400);
    return Response.json(input.data.dryRun ? await migrationInventory(owner) : await migratePhoto(owner, input.data.id));
  } catch (error) { return libraryError(error); }
}
