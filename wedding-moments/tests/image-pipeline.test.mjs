import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const modules = new Map();
function moduleUrl(path) {
  path = resolve(path);
  if (modules.has(path)) return modules.get(path);
  let js = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  js = js.replace(/from ["']([^"']+)["']/g, (match, spec) => {
    if (spec.startsWith('.')) return `from '${moduleUrl(resolve(dirname(path), spec + '.ts'))}'`;
    if (spec === 'zod') return `from '${pathToFileURL(require.resolve('zod')).href}'`;
    return match;
  });
  const url = 'data:text/javascript;base64,' + Buffer.from(js).toString('base64'); modules.set(path, url); return url;
}
const { imageMac, verifyImageMac } = await import(moduleUrl('lib/image-protocol.ts'));
const { default: worker } = await import(moduleUrl('workers/images/index.ts'));
const urls = await import(moduleUrl('lib/photo-urls.ts'));
const secret = 'unit-test-secret-at-least-32-characters';
const jpg = new Uint8Array([255, 216, 255, 224, 1, 2, 3, 4]);
const sha256 = createHash('sha256').update(jpg).digest('hex');
const input = { key: `albums/${'a'.repeat(32)}/${'b'.repeat(36)}.jpg`, previewKey: `albums/${'a'.repeat(32)}/${'b'.repeat(36)}.jpg`,
  stagingKey: `uploads/${'a'.repeat(32)}/${'b'.repeat(36)}.jpg`, size: jpg.length, contentType: 'image/jpeg', sha256 };
class Bucket {
  objects = new Map(); deletes = [];
  async head(key) { const record = this.objects.get(key); return record ? { ...record, key, size: record.bytes.length, etag: record.etag } : null; }
  async get(key, options) {
    const record = await this.head(key);
    if (!record) return null;
    if (options?.onlyIf?.etagMatches && options.onlyIf.etagMatches !== record.etag) return record;
    return { ...record, body: new Response(record.bytes).body };
  }
  async put(key, body, options = {}) {
    if (options.onlyIf?.etagDoesNotMatch === '*' && this.objects.has(key)) return null;
    const bytes = new Uint8Array(await new Response(body).arrayBuffer());
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (options.sha256 && options.sha256 !== digest) throw new Error('Checksum mismatch');
    const record = { bytes, customMetadata: options.customMetadata, etag: digest };
    this.objects.set(key, record); return record;
  }
  async delete(key) { this.deletes.push(key); this.objects.delete(key); }
}
function environment() {
  const calls = [];
  return { calls, IMAGE_WORKER_SECRET: secret, ORIGINALS: new Bucket(), PREVIEWS: new Bucket(), IMAGES: {
    async info(stream) { const bytes = new Uint8Array(await new Response(stream).arrayBuffer()); return { width: bytes.length === jpg.length ? 6000 : 2400, height: bytes.length === jpg.length ? 4000 : 1600, format: 'image/jpeg' }; },
    input(stream) { return { transform(options) { calls.push(options); return this; }, async output(options) { calls.push(options); await new Response(stream).arrayBuffer(); return { image: () => new Response(new Uint8Array([255,216,255,224,5])).body, response: () => new Response('thumbnail', { headers: { 'Content-Type': options.format } }) }; } }; },
  } };
}
async function internal(action, input, env, expires = Math.floor(Date.now()/1000)+120) {
  const body = JSON.stringify({ expires, input });
  return worker.fetch(new Request(`https://images.example/internal/${action}`, { method: 'POST', headers: { 'X-Image-Signature': await imageMac(secret, action+'\n'+body) }, body }), env, { waitUntil() {} });
}
test('new viewer and gallery URLs never point to original; legacy remains readable', () => {
  const photo = { id: 'abc', pipeline: 'r2-v2', src: 'DO-NOT-LOAD', preview: 'DO-NOT-LOAD', status: 'ready' };
  assert.equal(urls.getPhotoPreviewUrl(photo), '/api/library/photo/abc?variant=preview');
  assert.equal(urls.getPhotoThumbnailUrl(photo), '/api/library/photo/abc?variant=thumbnail');
  assert.equal(urls.isPhotoReady({ ...photo, status: 'failed' }), false);
  assert.equal(urls.getPhotoPreviewUrl({ id: 'legacy', src: '/legacy.jpg' }), '/legacy.jpg');
});
test('process validates original hash, persists identical bytes, creates only one JPEG preview, retries idempotently', async () => {
  const env = environment(); await env.ORIGINALS.put(input.stagingKey, jpg);
  const response = await internal('process', input, env);
  assert.equal(response.status, 200);
  const result = await response.json(); assert.equal(result.previewWidth, 2400); assert.equal(result.sha256, sha256);
  assert.deepEqual(env.ORIGINALS.objects.get(input.key).bytes, jpg);
  assert.equal(env.PREVIEWS.objects.size, 1);
  assert.deepEqual(env.calls[0], { width: 2400, height: 2400, fit: 'scale-down' });
  assert.equal(env.calls[1].quality, 85); assert.equal(env.calls[1].format, 'image/jpeg');
  assert.equal((await internal('process', input, env)).status, 200);
  assert.equal(env.calls.length, 2);
  await env.ORIGINALS.put(input.stagingKey, new Uint8Array([9,9,9]));
  assert.equal((await internal('process', input, env)).status, 200);
  assert.deepEqual(env.ORIGINALS.objects.get(input.key).bytes, jpg, 'replayed PUT cannot replace committed original');
});
test('bad checksum and expired command rejected; original retained if preview fails', async () => {
  const env = environment(); await env.ORIGINALS.put(input.stagingKey, jpg);
  assert.equal((await internal('process', { ...input, sha256: '0'.repeat(64) }, env)).status, 422);
  assert.equal(env.ORIGINALS.objects.has(input.key), false);
  assert.equal((await internal('process', input, env, 1)).status, 403);
  env.IMAGES.input = () => { throw new Error('Images unavailable'); };
  assert.equal((await internal('process', input, env)).status, 503);
  assert.deepEqual(env.ORIGINALS.objects.get(input.key).bytes, jpg);
});
test('delete removes both objects and staging, and is safe to retry', async () => {
  const env = environment(); await env.ORIGINALS.put(input.stagingKey, jpg); await internal('process', input, env);
  assert.equal((await internal('delete', input, env)).status, 200);
  assert.equal(env.ORIGINALS.objects.size, 0); assert.equal(env.PREVIEWS.objects.size, 0);
  assert.equal((await internal('delete', input, env)).status, 200);
});
test('thumbnail is a fixed transform from preview, stable cache ignores token expiry; auth checked before cache', async t => {
  const env = environment(); await env.ORIGINALS.put(input.stagingKey, jpg); await internal('process', input, env);
  const cached = new Map(), keys = [];
  const previousCaches = Object.getOwnPropertyDescriptor(globalThis, 'caches');
  Object.defineProperty(globalThis, 'caches', { configurable: true, value: { default: { async match(request) { keys.push(request.url); return cached.get(request.url)?.clone(); }, async put(request, response) { cached.set(request.url, response); } } } });
  t.after(() => { if (previousCaches) Object.defineProperty(globalThis, 'caches', previousCaches); else delete globalThis.caches; });
  const tasks = [], ctx = { waitUntil(p) { tasks.push(p); } };
  async function url(exp) { const u = new URL('https://images.example/media/thumbnail'); u.searchParams.set('key', input.previewKey); u.searchParams.set('exp', String(exp)); u.searchParams.set('sig', await imageMac(secret, u.pathname+'?'+u.searchParams)); return u; }
  const expiry = Math.floor(Date.now()/1000)+250;
  const first = await worker.fetch(new Request(await url(expiry), { headers: { Accept: 'image/webp' } }), env, ctx);
  assert.equal(first.status, 200); await Promise.all(tasks);
  assert.deepEqual(env.calls[2], { width: 600, height: 600, fit: 'cover' });
  await worker.fetch(new Request(await url(expiry+1), { headers: { Accept: 'image/webp' } }), env, ctx);
  assert.equal(keys[0], keys[1]); assert.equal(env.calls.length, 4);
  assert.equal((await worker.fetch(new Request(await url(1)), env, ctx)).status, 403);
  assert.equal(keys.length, 2, 'unauthorized request cannot read cache');
  await env.PREVIEWS.delete(input.previewKey);
  assert.equal((await worker.fetch(new Request(await url(expiry)), env, ctx)).status, 404);
});
test('HMAC rejects tampering and malformed signatures', async () => {
  const signature = await imageMac(secret, 'photo1');
  assert.equal(await verifyImageMac(secret, 'photo1', signature), true);
  assert.equal(await verifyImageMac(secret, 'photo2', signature), false);
  assert.equal(await verifyImageMac(secret, 'photo1', 'bad'), false);
});
