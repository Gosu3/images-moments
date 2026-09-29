import { libraryError, libraryOwner } from "@/lib/library-server";
import { cleanupPhotos } from "@/lib/image-lifecycle";
export async function POST(request: Request) {
  try { return Response.json(await cleanupPhotos(await libraryOwner(request, true))); }
  catch (error) { return libraryError(error); }
}
