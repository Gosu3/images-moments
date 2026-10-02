import { libraryError, libraryOwner } from "@/lib/library-server";
import { cleanupPhotos } from "@/lib/image-lifecycle";
export const maxDuration = 60;
export async function POST(request: Request) {
  try { return Response.json(await cleanupPhotos(await libraryOwner(request, true))); }
  catch (error) { return libraryError(error); }
}
// Vercel Cron (vercel.json) calls GET with `Authorization: Bearer $CRON_SECRET`.
// Only tombstones older than the grace period are purged, so an accidental
// delete stays recoverable from R2 for a week.
const CRON_GRACE_MS = 7 * 24 * 3600 * 1000;
function cronAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim() ?? "";
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (secret.length < 16 || given.length !== expected.length) return false;
  let difference = 0;
  for (let i = 0; i < expected.length; i++) difference |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return difference === 0;
}
export async function GET(request: Request) {
  if (!process.env.VERCEL || !cronAuthorized(request)) return Response.json({ error: "Không có quyền." }, { status: 401 });
  try {
    const started = Date.now();
    let removed = 0, pending = 0;
    while (Date.now() - started < 45_000) {
      const result = await cleanupPhotos("vercel-admin", CRON_GRACE_MS);
      removed += result.removed; pending = result.pending;
      if (!result.removed) break;
    }
    return Response.json({ removed, pending }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return libraryError(error); }
}
