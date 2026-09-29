import { imagesEnabled, setting } from "./cloud-config";

function config() {
  const account = setting("CF_IMAGES_ACCOUNT_ID") || setting("R2_ACCOUNT_ID");
  const token = setting("CF_IMAGES_API_TOKEN");
  const hash = setting("CF_IMAGE_ACCOUNT_HASH");
  const signing = setting("CF_IMAGE_SIGNING_KEY");
  if (!/^[a-f0-9]{32}$/i.test(account) || !token || !hash || !signing) throw new Error("Cloudflare Images configuration missing");
  return { account, token, hash, signing };
}
export async function uploadPreview(file: File): Promise<string | undefined> {
  if (!imagesEnabled()) return undefined;
  const { account, token } = config();
  if (file.size > 10 * 1024 * 1024) throw new Error("Preview exceeds Images limit");
  const form = new FormData();
  form.set("file", file); form.set("requireSignedURLs", "true");
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/images/v1`, {
    method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form, signal: AbortSignal.timeout(45000),
  });
  if (!response.ok) throw new Error(`Images upload failed (${response.status})`);
  const result = await response.json() as { success: boolean; result?: { id: string } };
  if (!result.success || !result.result?.id) throw new Error("Images upload failed");
  return result.result.id;
}
export async function signedPreviewUrl(imageId: string) {
  const { hash, signing } = config();
  const variant = setting("CF_IMAGES_THUMBNAIL_VARIANT") || "thumbnail";
  const url = new URL(`https://imagedelivery.net/${encodeURIComponent(hash)}/${encodeURIComponent(imageId)}/${encodeURIComponent(variant)}`);
  url.searchParams.set("exp", String(Math.floor(Date.now() / 1000) + 300));
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(signing), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(url.pathname + "?" + url.searchParams.toString()));
  url.searchParams.set("sig", [...new Uint8Array(signature)].map(v => v.toString(16).padStart(2, "0")).join(""));
  return url.toString();
}
