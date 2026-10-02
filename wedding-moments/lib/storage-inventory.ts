import { bucket, LibraryError } from "./library-server";
import { originalProvider } from "./cloud-config";
import { createR2SignedUrl } from "./r2-presign";
import { galleryVariantKey } from "./gallery-preview";
import type { LibraryPhoto } from "./library-model";

export type StoredObject = { key: string; size: number; uploaded?: string };
const MAX_OBJECTS = 100_000;

function xmlText(value: string) {
  return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}
// Read-only listing of the originals bucket (ListObjectsV2 or Worker binding).
export async function listStoredObjects(): Promise<StoredObject[]> {
  const objects: StoredObject[] = [];
  if (originalProvider() === "binding") {
    let cursor: string | undefined;
    do {
      const page = await bucket().list({ cursor, limit: 1000 });
      objects.push(...page.objects.map(o => ({ key: o.key, size: o.size, uploaded: o.uploaded.toISOString() })));
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor && objects.length < MAX_OBJECTS);
    return objects;
  }
  let token: string | undefined;
  do {
    const url = await createR2SignedUrl({ method: "GET", key: "", expires: 300, params: { "list-type": "2", "max-keys": "1000", ...(token ? { "continuation-token": token } : {}) } });
    if (!url) throw new LibraryError("Chưa cấu hình đầy đủ Cloudflare R2.");
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new LibraryError(`Không thể liệt kê file trên R2 (${response.status}).`);
    const xml = await response.text();
    for (const [, body] of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
      const key = /<Key>([\s\S]*?)<\/Key>/.exec(body)?.[1];
      if (key) objects.push({ key: xmlText(key), size: Number(/<Size>(\d+)<\/Size>/.exec(body)?.[1] ?? 0), uploaded: /<LastModified>([^<]+)<\/LastModified>/.exec(body)?.[1] });
    }
    token = /<IsTruncated>true<\/IsTruncated>/.test(xml) ? xmlText(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/.exec(xml)?.[1] ?? "") || undefined : undefined;
  } while (token && objects.length < MAX_OBJECTS);
  return objects;
}

// Compares the bucket with library metadata. Nothing is deleted here: orphans
// must be reviewed by a person, and "missing" means a listed photo lost bytes.
export function inventoryReport(photos: LibraryPhoto[], objects: StoredObject[], storage: "binding" | "s3") {
  const live = new Set<string>(), tombstoned = new Set<string>();
  for (const photo of photos) {
    const target = photo.status === "deleted" && !photo.cleanupComplete ? tombstoned : photo.status === "deleted" ? undefined : live;
    if (!target) continue;
    for (const key of [photo.key, photo.key && galleryVariantKey(photo, "thumbnail"), photo.key && galleryVariantKey(photo, "preview"), photo.stagingKey, photo.legacySource?.key]) if (key) target.add(key);
  }
  const stored = new Set(objects.map(o => o.key));
  const orphans = objects.filter(o => !live.has(o.key) && !tombstoned.has(o.key));
  const awaitingCleanup = objects.filter(o => !live.has(o.key) && tombstoned.has(o.key));
  const missing = photos.filter(p => p.status === "ready" && p.key && (p.storage ?? "binding") === storage && !stored.has(p.key))
    .map(p => ({ id: p.id, filename: p.filename, album: p.album, key: p.key! }));
  const bytes = (list: StoredObject[]) => list.reduce((sum, o) => sum + o.size, 0);
  return {
    objects: objects.length, truncated: objects.length >= MAX_OBJECTS,
    orphans: { count: orphans.length, bytes: bytes(orphans), items: orphans.slice(0, 500) },
    awaitingCleanup: { count: awaitingCleanup.length, bytes: bytes(awaitingCleanup) },
    missing: { count: missing.length, items: missing.slice(0, 500) },
  };
}
