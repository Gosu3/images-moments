import { bucket, LibraryError } from "./library-server";
import { originalProvider } from "./cloud-config";
import { createR2SignedUrl } from "./r2-presign";
import type { LibraryPhoto } from "./library-model";

async function signed(method: "GET" | "PUT" | "DELETE" | "HEAD", key: string, contentType?: string) {
  const url = await createR2SignedUrl({ method, key, contentType, expires: 300 });
  if (!url) throw new LibraryError("Chưa cấu hình đầy đủ Cloudflare R2.");
  return url;
}
export async function putOriginal(key: string, file: File, sha256: string, provider = originalProvider()) {
  if (provider === "binding") {
    await bucket().put(key, file.stream(), { httpMetadata: { contentType: file.type }, customMetadata: { sha256 } });
  } else {
    const response = await fetch(await signed("PUT", key, file.type), {
      method: "PUT", headers: { "Content-Type": file.type }, body: file,
      signal: AbortSignal.timeout(120000),
    });
    if (!response.ok) throw new LibraryError(`Không thể lưu ảnh gốc trên R2 (${response.status}).`);
    await response.body?.cancel();
  }
  return provider;
}
export async function getOriginal(photo: LibraryPhoto): Promise<Response> {
  if (!photo.key) throw new LibraryError("Không tìm thấy ảnh.", 404);
  // Existing objects remain in their original bucket when storage is switched.
  if ((photo.storage ?? "binding") === "binding") {
    const object = await bucket().get(photo.key);
    if (!object) throw new LibraryError("Không tìm thấy ảnh.", 404);
    return new Response(object.body as ReadableStream, { headers: { "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream", "Content-Length": String(object.size) } });
  }
  const response = await fetch(await signed("GET", photo.key), { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new LibraryError("Không thể đọc ảnh gốc từ R2.", response.status === 404 ? 404 : 503);
  return response;
}
export async function headOriginal(photo: LibraryPhoto): Promise<{ size: number; contentType: string }> {
  if (!photo.key) throw new LibraryError("Không tìm thấy ảnh.", 404);
  if ((photo.storage ?? "binding") === "binding") {
    const object = await bucket().head(photo.key);
    if (!object) throw new LibraryError("Không tìm thấy ảnh.", 404);
    return { size: object.size, contentType: object.httpMetadata?.contentType ?? "application/octet-stream" };
  }
  const response = await fetch(await signed("HEAD", photo.key), { method: "HEAD", signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new LibraryError("Không thể xác nhận ảnh gốc trên R2.", response.status === 404 ? 404 : 503);
  return { size: Number(response.headers.get("content-length")), contentType: response.headers.get("content-type") ?? "application/octet-stream" };
}
// First bytes only (range read), so finalize can verify the real file format
// without downloading the whole original through the app server.
export async function readOriginalHeader(photo: LibraryPhoto, length = 32): Promise<Uint8Array> {
  if (!photo.key) throw new LibraryError("Không tìm thấy ảnh.", 404);
  if ((photo.storage ?? "binding") === "binding") {
    const object = await bucket().get(photo.key, { range: { offset: 0, length } });
    if (!object) throw new LibraryError("Không tìm thấy ảnh.", 404);
    return new Uint8Array(await object.arrayBuffer()).slice(0, length);
  }
  const response = await fetch(await signed("GET", photo.key), { headers: { Range: `bytes=0-${length - 1}` }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new LibraryError("Không thể đọc ảnh gốc từ R2.", response.status === 404 ? 404 : 503);
  return new Uint8Array(await response.arrayBuffer()).slice(0, length);
}
const VARIANT_URL_WINDOW = 6 * 3600 * 1000;
// Stable for each 6-hour window (valid 24h) so browsers and the CDN can reuse
// the same thumbnail URL instead of streaming bytes through the app server.
export async function cacheableVariantUrl(key: string, now = Date.now()) {
  const url = await createR2SignedUrl({ method: "GET", key, expires: 86400, signedAt: new Date(Math.floor(now / VARIANT_URL_WINDOW) * VARIANT_URL_WINDOW),
    params: { "response-cache-control": "private, max-age=86400, immutable" } });
  if (!url) throw new LibraryError("Chưa cấu hình đầy đủ Cloudflare R2.");
  return url;
}
export async function removeUncommittedOriginal(key: string, storage: "binding" | "s3") {
  if (storage === "binding") return bucket().delete(key);
  const response = await fetch(await signed("DELETE", key), { method: "DELETE", signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`R2 cleanup failed (${response.status})`);
  await response.body?.cancel();
}
