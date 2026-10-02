import { libraryError, libraryOwner } from "@/lib/library-server";
import { readR2Operations } from "@/lib/r2-operations";
// Admin-only: R2 Class A/B operation counts for the current month (Cloudflare GraphQL Analytics).
export async function GET(request: Request) {
  try {
    await libraryOwner(request);
  } catch (error) { return libraryError(error); }
  try {
    return Response.json(await readR2Operations(), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Không đọc được số thao tác R2." }, { status: 503 });
  }
}
