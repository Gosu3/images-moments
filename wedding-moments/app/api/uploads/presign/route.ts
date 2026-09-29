import { libraryError, libraryOwner } from "@/lib/library-server";
import { beginUpload } from "@/lib/image-lifecycle";
export async function POST(request: Request) {
  try { return Response.json(await beginUpload(await libraryOwner(request, true), await request.json()), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return libraryError(error); }
}
