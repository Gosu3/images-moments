// Shared by the app and the dedicated image Worker. No runtime secrets here.
export const PREVIEW_EDGE = 2400;
export const PREVIEW_QUALITY = 85;
export const THUMBNAIL_OPTIONS = { width: 600, height: 600, fit: "cover" as const };
export const UPLOAD_TTL = 900;
export const DOWNLOAD_TTL = 300;
export async function imageMac(secret: string, value: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return [...new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)))].map(b => b.toString(16).padStart(2, "0")).join("");
}
export async function verifyImageMac(secret: string, value: string, signature: string) {
  if (!/^[a-f0-9]{64}$/.test(signature)) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  return crypto.subtle.verify("HMAC", key, Uint8Array.from(signature.match(/../g)!, x => parseInt(x, 16)), encoder.encode(value));
}
export function safeObjectKey(key: string) {
  return /^(albums|uploads)\/[a-f0-9]{32}\/[a-f0-9-]{36}\.(jpg|png|webp)$/.test(key);
}
