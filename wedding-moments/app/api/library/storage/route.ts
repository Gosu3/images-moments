import { imagesEnabled, libraryProvider, originalProvider, setting } from "@/lib/cloud-config";
import { libraryError, libraryOwner } from "@/lib/library-server";

export async function GET(request: Request) {
  try {
    await libraryOwner(request);
    const database = libraryProvider(), originals = originalProvider(), images = imagesEnabled();
    const required = [
      ...(database === "supabase" ? ["SUPABASE_URL", ...(setting("SUPABASE_SECRET_KEY") || setting("SUPABASE_SERVICE_ROLE_KEY") ? [] : ["SUPABASE_SECRET_KEY"])] : []),
      ...(originals === "s3" ? ["R2_ACCOUNT_ID", "R2_BUCKET_NAME", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"] : []),
      ...(images ? ["CF_IMAGES_API_TOKEN", "CF_IMAGE_ACCOUNT_HASH", "CF_IMAGE_SIGNING_KEY", ...(setting("CF_IMAGES_ACCOUNT_ID") || setting("R2_ACCOUNT_ID") ? [] : ["CF_IMAGES_ACCOUNT_ID"])] : []),
    ];
    // Configuration presence only; never return secret values or claim a live
    // provider connection has been verified without performing a real request.
    return Response.json({ database, originals, images, missing: required.filter(key => !setting(key)), checked: "configuration-only" }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return libraryError(error); }
}
