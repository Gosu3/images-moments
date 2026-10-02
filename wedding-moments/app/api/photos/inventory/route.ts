import { libraryError, libraryOwner, readLibrary } from "@/lib/library-server";
import { originalProvider } from "@/lib/cloud-config";
import { inventoryReport, listStoredObjects } from "@/lib/storage-inventory";
export const maxDuration = 60;
// Admin-only, read-only reconciliation of the R2 bucket against the library.
// Open /api/photos/inventory while signed in to review before any cleanup.
export async function GET(request: Request) {
  try {
    const owner = await libraryOwner(request);
    const [library, objects] = await Promise.all([readLibrary(owner), listStoredObjects()]);
    return Response.json(inventoryReport(library.photos, objects, originalProvider()), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return libraryError(error); }
}
