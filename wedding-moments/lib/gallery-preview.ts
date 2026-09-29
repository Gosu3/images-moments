import sharp from "sharp";
import { getOriginal, putOriginal } from "./original-storage";
import { LibraryError } from "./library-server";
import type { LibraryPhoto } from "./library-model";

export async function resizeGalleryImage(bytes: Uint8Array, variant: "thumbnail" | "preview") {
  return sharp(bytes, { limitInputPixels: 80_000_000 })
    .rotate()
    .resize({ width: variant === "thumbnail" ? 640 : 1920, height: variant === "thumbnail" ? 640 : 1920, fit: "inside", withoutEnlargement: true })
    .webp({ quality: variant === "thumbnail" ? 75 : 82 }).toBuffer();
}

// Persist generated variants in the same private bucket as the original.
// Existing uploads gain thumbnails on first view; later views read the small file.
const pending = new Map<string, Promise<Uint8Array>>();
export async function getGalleryPreview(photo: LibraryPhoto, variant: "thumbnail" | "preview") {
  const key = `${photo.key}.wm-${variant}-v1.webp`;
  try { return await getOriginal({ ...photo, key, contentType: "image/webp" }); }
  catch (error) { if (!(error instanceof LibraryError) || error.status !== 404) throw error; }
  let job = pending.get(key);
  if (!job) {
    job = (async () => {
      const original = await getOriginal(photo);
      const bytes = await resizeGalleryImage(new Uint8Array(await original.arrayBuffer()), variant);
      const file = new File([new Uint8Array(bytes)], "preview.webp", { type: "image/webp" });
      await putOriginal(key, file, "", photo.storage ?? "binding");
      return new Uint8Array(bytes);
    })();
    pending.set(key, job);
    void job.finally(() => pending.delete(key)).catch(() => undefined);
  }
  return new Response(new Uint8Array(await job), { headers: { "Content-Type": "image/webp" } });
}
