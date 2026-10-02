import { libraryError, readSharedLibrary } from "@/lib/library-server";
import { publicLibrary } from "@/lib/public-library";

export async function GET(request: Request) {
  try {
    const library = await readSharedLibrary(request);
    const etag = `"gallery-${library.revision}"`;
    // On Vercel the guest gallery is public: a 2s CDN cache lets hundreds of
    // polling guests share one function call. Elsewhere it is per-user.
    const headers = { "Cache-Control": process.env.VERCEL ? "public, max-age=0, s-maxage=2, stale-while-revalidate=5" : "private, no-cache", ETag: etag };
    if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
    return Response.json(publicLibrary(library), { headers });
  } catch (error) { return libraryError(error); }
}
