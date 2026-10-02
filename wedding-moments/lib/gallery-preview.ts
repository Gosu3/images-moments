import sharp from "sharp";
import { cacheableVariantUrl, getOriginal, headOriginal, putOriginal } from "./original-storage";
import { LibraryError } from "./library-server";
import type { LibraryPhoto } from "./library-model";

export async function resizeGalleryImage(bytes: Uint8Array, variant: "thumbnail" | "preview") {
  return sharp(bytes, { limitInputPixels: 80_000_000 })
    .rotate()
    .resize({ width: variant === "thumbnail" ? 640 : 2400, height: variant === "thumbnail" ? 640 : 2400, fit: "inside", withoutEnlargement: true })
    .webp({ quality: variant === "thumbnail" ? 78 : 86, effort: 4 }).toBuffer();
}

// Persist generated variants in the same private bucket as the original.
// Existing uploads gain thumbnails on first view; later views read the small file.
export function galleryVariantKey(photo: Pick<LibraryPhoto, "key">, variant: "thumbnail" | "preview") {
  return `${photo.key}.wm-${variant}-v2.webp`;
}
// Direct R2 location of an already generated variant, or null when it must
// still be generated (or the photo lives in the Worker binding bucket).
export async function galleryVariantLocation(photo: LibraryPhoto, variant: "thumbnail" | "preview") {
  if (photo.storage !== "s3" || !photo.key) return null;
  const key = galleryVariantKey(photo, variant);
  try { await headOriginal({ ...photo, key }); }
  catch (error) { if (error instanceof LibraryError && error.status === 404) return null; throw error; }
  return cacheableVariantUrl(key);
}
const pending = new Map<string, Promise<Uint8Array>>();
export async function getGalleryPreview(photo: LibraryPhoto, variant: "thumbnail" | "preview") {
  const key = galleryVariantKey(photo, variant);
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

const batches = new Map<string, Promise<void>>();
export async function prepareGalleryPreviews(photo: LibraryPhoto, sourceBytes?: Uint8Array) {
  const identity = photo.key!;
  let batch = batches.get(identity);
  if (!batch) {
    batch = (async () => {
      const variants = ["thumbnail", "preview"] as const;
      const missing: typeof variants[number][] = [];
      for (const variant of variants) {
        try { const cached = await getOriginal({ ...photo, key: galleryVariantKey(photo, variant), contentType: "image/webp" }); await cached.body?.cancel(); }
        catch (error) { if (error instanceof LibraryError && error.status === 404) missing.push(variant); else throw error; }
      }
      if (!missing.length) return;
      const bytes = sourceBytes ?? new Uint8Array(await (await getOriginal(photo)).arrayBuffer());
      await Promise.all(missing.map(async variant => {
        const output = await resizeGalleryImage(bytes, variant);
        const file = new File([new Uint8Array(output)], `${variant}.webp`, { type: "image/webp" });
        await putOriginal(galleryVariantKey(photo, variant), file, "", photo.storage ?? "binding");
      }));
    })();
    batches.set(identity, batch);
    void batch.finally(() => batches.delete(identity)).catch(() => undefined);
  }
  await batch;
}
