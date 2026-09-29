import { libraryError, readSharedLibrary } from "@/lib/library-server";
import { publicLibrary } from "@/lib/public-library";

export async function GET(request: Request) {
  try {
    const library = await readSharedLibrary(request);
    const etag = `"gallery-${library.revision}"`;
    const headers = { "Cache-Control": "private, no-cache", ETag: etag };
    if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
    return Response.json(publicLibrary(library), { headers });
  } catch (error) { return libraryError(error); }
}
