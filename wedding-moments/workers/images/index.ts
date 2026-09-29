import { createHash } from "node:crypto";
import { z } from "zod";
import { PREVIEW_EDGE, PREVIEW_QUALITY, THUMBNAIL_OPTIONS, safeObjectKey, verifyImageMac } from "../../lib/image-protocol";
import { validImageHeader, MAX_ORIGINAL_SIZE } from "../../lib/image-upload";

interface Env { ORIGINALS: R2Bucket; PREVIEWS: R2Bucket; IMAGES: ImagesBinding; IMAGE_WORKER_SECRET: string }
const keySchema = z.string().refine(safeObjectKey);
const processSchema = z.object({
  key: keySchema.refine(k => k.startsWith("albums/")), previewKey: keySchema.refine(k => k.startsWith("albums/") && k.endsWith(".jpg")),
  stagingKey: keySchema.refine(k => k.startsWith("uploads/")), sha256: z.string().regex(/^[a-f0-9]{64}$/),
  size: z.number().int().positive().max(MAX_ORIGINAL_SIZE), contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
});
type ProcessInput = z.infer<typeof processSchema>;
class PipelineError extends Error { constructor(message: string, public status = 422) { super(message); } }
async function object(bucket: R2Bucket, key: string, etag?: string) {
  const value = await bucket.get(key, etag ? { onlyIf: { etagMatches: etag } } : undefined);
  if (!value || !("body" in value)) throw new PipelineError("Object missing or changed", 409);
  return value as R2ObjectBody;
}
async function digest(value: R2ObjectBody, expected: ProcessInput) {
  if (value.size !== expected.size || value.size > MAX_ORIGINAL_SIZE) throw new PipelineError("Size mismatch");
  const hash = createHash("sha256"); let first = new Uint8Array(0), bytes = 0;
  const reader = value.body.getReader();
  while (true) {
    const { done, value: chunk } = await reader.read(); if (done) break;
    bytes += chunk.byteLength;
    if (bytes > MAX_ORIGINAL_SIZE) throw new PipelineError("Size exceeded");
    if (first.length < 32) { const next = new Uint8Array(Math.min(32, first.length + chunk.length)); next.set(first); next.set(chunk.slice(0, next.length - first.length), first.length); first = next; }
    hash.update(chunk);
  }
  if (bytes !== expected.size || hash.digest("hex") !== expected.sha256 || !validImageHeader(first, expected.contentType)) throw new PipelineError("Content verification failed");
}
async function processImage(input: ProcessInput, env: Env) {
  // The browser may replay its staging PUT until expiry. Freeze bytes into an
  // immutable final key; a replay can never overwrite a committed original.
  let original = await env.ORIGINALS.head(input.key);
  if (!original) {
    const staged = await object(env.ORIGINALS, input.stagingKey);
    const etag = staged.etag;
    await digest(staged, input);
    const source = await object(env.ORIGINALS, input.stagingKey, etag);
    await env.ORIGINALS.put(input.key, source.body, {
      onlyIf: { etagDoesNotMatch: "*" }, sha256: input.sha256,
      httpMetadata: { contentType: input.contentType }, customMetadata: { sha256: input.sha256 },
    });
    original = await env.ORIGINALS.head(input.key);
  }
  if (!original || original.size !== input.size || original.customMetadata?.sha256 !== input.sha256) throw new PipelineError("Original conflict", 409);
  const info = await env.IMAGES.info((await object(env.ORIGINALS, input.key)).body);
  if (!("width" in info) || info.format !== input.contentType || !info.width || !info.height || info.width * info.height > 100_000_000) throw new PipelineError("Invalid image dimensions or MIME");
  let preview = await env.PREVIEWS.head(input.previewKey);
  if (!preview) {
    // Images decodes the real original and applies EXIF orientation. No client
    // supplied dimensions or pre-rendered preview are trusted here.
    const result = await env.IMAGES.input((await object(env.ORIGINALS, input.key)).body)
      .transform({ width: PREVIEW_EDGE, height: PREVIEW_EDGE, fit: "scale-down" })
      .output({ format: "image/jpeg", quality: PREVIEW_QUALITY, background: "#ffffff", anim: false });
    await env.PREVIEWS.put(input.previewKey, result.image(), { onlyIf: { etagDoesNotMatch: "*" },
      httpMetadata: { contentType: "image/jpeg", cacheControl: "public, max-age=31536000, immutable" }, customMetadata: { originalSha256: input.sha256 } });
    preview = await env.PREVIEWS.head(input.previewKey);
  }
  if (!preview || preview.customMetadata?.originalSha256 !== input.sha256) throw new PipelineError("Preview conflict", 409);
  const previewInfo = await env.IMAGES.info((await object(env.PREVIEWS, input.previewKey)).body);
  if (!("width" in previewInfo) || Math.max(previewInfo.width, previewInfo.height) > PREVIEW_EDGE) throw new PipelineError("Invalid preview dimensions");
  await env.ORIGINALS.delete(input.stagingKey);
  return { width: info.width, height: info.height, previewWidth: previewInfo.width, previewHeight: previewInfo.height,
    size: input.size, contentType: input.contentType, sha256: input.sha256 };
}

async function media(request: Request, env: Env, ctx: ExecutionContext) {
  const url = new URL(request.url), signature = url.searchParams.get("sig") || "";
  url.searchParams.delete("sig");
  const expiry = Number(url.searchParams.get("exp"));
  if (!Number.isInteger(expiry) || expiry < Date.now() / 1000 || expiry > Date.now() / 1000 + 310 ||
      !await verifyImageMac(env.IMAGE_WORKER_SECRET, url.pathname + "?" + url.searchParams, signature)) throw new PipelineError("Forbidden", 403);
  const key = keySchema.parse(url.searchParams.get("key"));
  if (!key.startsWith("albums/") || !key.endsWith(".jpg")) throw new PipelineError("Invalid preview key");
  // Always check existence before cache access, including after cleanup.
  const head = await env.PREVIEWS.head(key);
  if (!head) throw new PipelineError("Preview not found", 404);
  const thumbnail = url.pathname === "/media/thumbnail";
  const accept = request.headers.get("accept") || "";
  const format = thumbnail && accept.includes("image/avif") ? "image/avif" : thumbnail && accept.includes("image/webp") ? "image/webp" : "image/jpeg";
  // Stable internal key excludes exp/sig and arbitrary width parameters.
  const cacheKey = new Request(`${url.origin}/_cache/${thumbnail ? "thumbnail600-v1" : "preview-v1"}/${encodeURIComponent(key)}/${head.etag}/${format.split("/")[1]}`);
  const cache = (caches as CacheStorage & { default: Cache }).default;
  let response = await cache.match(cacheKey);
  if (!response) {
    const preview = await object(env.PREVIEWS, key, head.etag);
    response = thumbnail
      ? (await env.IMAGES.input(preview.body).transform(THUMBNAIL_OPTIONS).output({ format, quality: 85, anim: false })).response()
      : new Response(preview.body as ReadableStream, { headers: { "Content-Type": "image/jpeg" } });
    response = new Response(response.body, response);
    response.headers.set("Cache-Control", "public, max-age=31536000, immutable");
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
  }
  const delivered = new Response(response.body, response);
  // Do not turn the existing private gallery into a public CDN. Edge cache is
  // shared only *after* token validation; browser cache cannot outlive the token.
  delivered.headers.set("Cache-Control", `private, max-age=${Math.max(0, Math.min(300, Math.floor(expiry - Date.now() / 1000)))}`);
  delivered.headers.set("Vary", "Accept");
  delivered.headers.set("X-Content-Type-Options", "nosniff");
  return delivered;
}

const imageWorker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      if (!env.IMAGE_WORKER_SECRET || env.IMAGE_WORKER_SECRET.length < 32) throw new PipelineError("Worker not configured", 503);
      const path = new URL(request.url).pathname;
      if (request.method === "GET" && ["/media/preview", "/media/thumbnail"].includes(path)) return await media(request, env, ctx);
      if (request.method !== "POST" || !["/internal/process", "/internal/delete"].includes(path)) return new Response("Not found", { status: 404 });
      const body = await request.text();
      if (body.length > 4096) throw new PipelineError("Request too large", 413);
      const action = path.split("/").pop()!;
      if (!await verifyImageMac(env.IMAGE_WORKER_SECRET, action + "\n" + body, request.headers.get("X-Image-Signature") || "")) throw new PipelineError("Forbidden", 403);
      const envelope = z.object({ expires: z.number().int(), input: z.unknown() }).parse(JSON.parse(body));
      if (envelope.expires < Date.now() / 1000 || envelope.expires > Date.now() / 1000 + 130) throw new PipelineError("Expired", 403);
      if (action === "process") return Response.json(await processImage(processSchema.parse(envelope.input), env));
      const input = z.object({ key: keySchema, previewKey: keySchema, stagingKey: keySchema.optional() }).parse(envelope.input);
      // Idempotent deletes; caller retains its DB tombstone until all succeed.
      await env.PREVIEWS.delete(input.previewKey);
      await env.ORIGINALS.delete(input.key);
      if (input.stagingKey) await env.ORIGINALS.delete(input.stagingKey);
      return Response.json({ deleted: true });
    } catch (error) {
      const status = error instanceof PipelineError ? error.status : error instanceof z.ZodError ? 400 : 503;
      return Response.json({ error: "Image operation failed", status }, { status });
    }
  },
};
export default imageWorker;
