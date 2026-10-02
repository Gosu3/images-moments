import { libraryError, readSharedLibrary } from "@/lib/library-server";
import { publicLibrary } from "@/lib/public-library";
import { cacheableVariantUrl, variantUrlWindow } from "@/lib/original-storage";
import { galleryVariantKey } from "@/lib/gallery-preview";

export async function GET(request: Request) {
  try {
    const library = await readSharedLibrary(request);
    // Signed R2 URLs rotate every window, so the window is part of the ETag.
    const etag = `"gallery-${library.revision}-${variantUrlWindow()}"`;
    // On Vercel the guest gallery is public: a 2s CDN cache lets hundreds of
    // polling guests share one function call. Elsewhere it is per-user.
    const headers = { "Cache-Control": process.env.VERCEL ? "public, max-age=0, s-maxage=2, stale-while-revalidate=5" : "private, no-cache", ETag: etag };
    if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
    const result = publicLibrary(library);
    if (process.env.VERCEL) {
      // Point images straight at R2 so each thumbnail skips the function hop
      // (Supabase read + HEAD + 302). Clients fall back to the route on error.
      const byId = new Map(library.photos.map(p => [p.id, p]));
      await Promise.all(result.photos.map(async photo => {
        const source = byId.get(photo.id);
        if (source?.storage !== "s3" || !source.key || source.pipeline === "r2-v2") return;
        try {
          [photo.preview, photo.src] = await Promise.all([
            cacheableVariantUrl(galleryVariantKey(source, "thumbnail")),
            cacheableVariantUrl(galleryVariantKey(source, "preview")),
          ]);
        } catch { /* keep route URLs */ }
      }));
    }
    return Response.json(result, { headers });
  } catch (error) { return libraryError(error); }
}
