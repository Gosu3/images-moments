import { setting } from "./cloud-config";
import { imageMac } from "./image-protocol";
import { LibraryError } from "./library-server";
export function imagePipelineEnabled() { return setting("IMAGE_PIPELINE") === "r2-v2"; }
export function originalsBucket() { return setting("R2_ORIGINALS_BUCKET") || "wedding-originals"; }
function service() {
  const base = setting("IMAGE_DELIVERY_DOMAIN"), secret = setting("IMAGE_WORKER_SECRET");
  if (!base || secret.length < 32) throw new LibraryError("Chưa cấu hình image Worker và khóa kết nối.");
  const url = new URL(base);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/") throw new LibraryError("IMAGE_DELIVERY_DOMAIN phải là HTTPS origin.");
  return { base: url.origin, secret };
}
export async function imageServiceCall<T>(action: "process" | "delete" | "import", input: unknown): Promise<T> {
  const { base, secret } = service();
  const body = JSON.stringify({ expires: Math.floor(Date.now() / 1000) + 120, input });
  const response = await fetch(`${base}/internal/${action}`, { method: "POST", headers: { "Content-Type": "application/json", "X-Image-Signature": await imageMac(secret, action + "\n" + body) }, body, signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new LibraryError(`Xử lý ảnh thất bại (${response.status}). Có thể thử lại.`, response.status === 409 ? 409 : 503);
  return response.json() as Promise<T>;
}
export async function imageDeliveryUrl(key: string, variant: "preview" | "thumbnail") {
  const { base, secret } = service();
  const url = new URL(`/media/${variant}`, base);
  url.searchParams.set("key", key);
  url.searchParams.set("exp", String(Math.floor(Date.now() / 1000) + 300));
  url.searchParams.set("sig", await imageMac(secret, url.pathname + "?" + url.searchParams));
  return url.toString();
}
export type ProcessedImage = { width: number; height: number; previewWidth: number; previewHeight: number; size: number; sha256: string; contentType: string };
