import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const dataUrl = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
function compiledUrl(path, imports = {}) {
  const source = readFileSync(path, 'utf8').replace(/from "([^"]+)"/g, (match, name) => imports[name] ? `from "${imports[name]}"` : match);
  return dataUrl(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText);
}
const config = { R2_ACCOUNT_ID: 'a'.repeat(32), R2_BUCKET_NAME: 'private-test', R2_ACCESS_KEY_ID: 'test-access', R2_SECRET_ACCESS_KEY: 'test-secret' };
const configUrl = dataUrl(`export const setting = name => (${JSON.stringify(config)})[name] || ''; export const originalProvider = () => 's3'; export const directR2Enabled = () => true;`);

test('guests poll every 3s while photos arrive and back off when the library is quiet', async () => {
  const { guestPollDelay } = await import(compiledUrl('lib/poll-delay.ts'));
  assert.equal(guestPollDelay(0), 3000);
  assert.equal(guestPollDelay(119_000), 3000);
  assert.equal(guestPollDelay(5 * 60_000), 10_000);
  assert.equal(guestPollDelay(60 * 60_000), 20_000);
});

test('R2 signer: stable URLs per window, signed checksum header, bucket listing path', async () => {
  const { createR2SignedUrl } = await import(compiledUrl('lib/r2-presign.ts', { './cloud-config': configUrl }));
  const signedAt = new Date('2026-10-02T06:00:00Z');
  const a = await createR2SignedUrl({ method: 'GET', key: 'albums/x/y.jpg.wm-thumbnail-v2.webp', signedAt, expires: 86400 });
  const b = await createR2SignedUrl({ method: 'GET', key: 'albums/x/y.jpg.wm-thumbnail-v2.webp', signedAt, expires: 86400 });
  assert.equal(a, b);
  const put = new URL(await createR2SignedUrl({ method: 'PUT', key: 'k.jpg', contentType: 'image/jpeg', checksumSha256: 'abc=' }));
  assert.equal(put.searchParams.get('X-Amz-SignedHeaders'), 'content-type;host;x-amz-checksum-sha256');
  const list = new URL(await createR2SignedUrl({ method: 'GET', key: '', params: { 'list-type': '2' } }));
  assert.equal(list.pathname, '/private-test');
  assert.equal(list.searchParams.get('list-type'), '2');
});

const variantUrl = dataUrl(`export function galleryVariantKey(photo, variant) { return photo.key + '.wm-' + variant + '-v2.webp'; }`);
const serverStub = dataUrl(`export class LibraryError extends Error { constructor(m, s = 503, c) { super(m); this.status = s; this.code = c; } } export function bucket() { throw new Error('no binding'); }`);

test('inventory separates live, tombstoned, orphaned and missing objects without deleting', async () => {
  const { inventoryReport } = await import(compiledUrl('lib/storage-inventory.ts', { './library-server': serverStub, './cloud-config': configUrl, './r2-presign': dataUrl('export async function createR2SignedUrl() { return null; }'), './gallery-preview': variantUrl }));
  const photos = [
    { id: 'live', filename: 'a.jpg', album: 'x', key: 'albums/a.jpg', storage: 's3', status: 'ready' },
    { id: 'gone', filename: 'b.jpg', album: 'x', key: 'albums/b.jpg', storage: 's3', status: 'ready' },
    { id: 'del', filename: 'c.jpg', album: 'x', key: 'albums/c.jpg', storage: 's3', status: 'deleted' },
  ];
  const objects = ['albums/a.jpg', 'albums/a.jpg.wm-thumbnail-v2.webp', 'albums/c.jpg', 'albums/stray.jpg'].map(key => ({ key, size: 10 }));
  const report = inventoryReport(photos, objects, 's3');
  assert.deepEqual(report.orphans.items.map(o => o.key), ['albums/stray.jpg']);
  assert.equal(report.awaitingCleanup.count, 1);
  assert.deepEqual(report.missing.items.map(p => p.id), ['gone']);
});

const lifecycleState = dataUrl(`
 export const state = { library: { photos: [], albums: [{ slug: 'album' }] }, header: new Uint8Array([255, 216, 255, 224]), removed: [] };
 export class LibraryError extends Error { constructor(m, s = 503, c) { super(m); this.status = s; this.code = c; } }
 export async function mutateLibrary(owner, update) { update(state.library); return structuredClone(state.library); }
 export async function readLibrary() { return structuredClone(state.library); }
 export function imagePipelineEnabled() { return false; }
 export function directR2Enabled() { return true; }
 export function setting() { return ''; }
 export function originalsBucket() { return 'bucket'; }
 export async function imageServiceCall() { throw new Error('Unexpected worker call'); }
 export async function createR2SignedUrl() { return 'https://r2.example/upload'; }
 export const UPLOAD_TTL = 900;
 export async function headOriginal(photo) { return { size: photo.size, contentType: photo.contentType }; }
 export async function readOriginalHeader() { return state.header; }
 export async function removeUncommittedOriginal(key) { state.removed.push(key); }
 export function galleryVariantKey(photo, variant) { return photo.key + '.' + variant; }
 export const DUPLICATE_UPLOAD_CODE = 'DUPLICATE_FILENAME';
 export function findDuplicatePhoto() { return undefined; }
`);
const imageUploadUrl = compiledUrl('lib/image-upload.ts');
const lifecycle = await import(compiledUrl('lib/image-lifecycle.ts', {
  ...Object.fromEntries(['./library-server', './image-service', './r2-presign', './image-protocol', './cloud-config', './original-storage', './gallery-preview', './upload-duplicates'].map(name => [name, lifecycleState])),
  './image-upload': imageUploadUrl, zod: pathToFileURL(require.resolve('zod')).href,
}));
const { state } = await import(lifecycleState);
const directPhoto = (id, extra = {}) => ({ id, album: 'album', filename: id + '.jpg', key: `albums/${id}.jpg`, storage: 's3', pipeline: 'r2-direct', status: 'pending', size: 4, contentType: 'image/jpeg', ...extra });

test('finalize rejects a file whose real bytes are not the declared image format', async () => {
  state.library.photos = [directPhoto('fake')];
  state.header = new TextEncoder().encode('<html><script>x</script>');
  await assert.rejects(lifecycle.finalizeUpload('owner', 'fake'), error => error.status === 422);
  assert.equal(state.library.photos[0].status, 'failed');
  state.library.photos = [directPhoto('real')];
  state.header = new Uint8Array([255, 216, 255, 224]);
  assert.equal((await lifecycle.finalizeUpload('owner', 'real')).status, 'ready');
});

test('scheduled cleanup keeps tombstones inside the grace period recoverable', async () => {
  const day = 24 * 3600 * 1000, past = new Date(Date.now() - 60_000).toISOString();
  state.removed.length = 0;
  state.library.photos = [
    directPhoto('recent', { status: 'deleted', deletedAt: new Date(Date.now() - day).toISOString(), cleanupAfter: past }),
    directPhoto('old', { status: 'deleted', deletedAt: new Date(Date.now() - 8 * day).toISOString(), cleanupAfter: past }),
  ];
  const result = await lifecycle.cleanupPhotos('owner', 7 * day);
  assert.equal(result.removed, 1);
  assert.deepEqual(state.library.photos.map(p => p.id), ['recent']);
  assert.ok(state.removed.every(key => key.startsWith('albums/old.jpg')));
});

test('cron cleanup refuses requests without the configured secret', async () => {
  const route = await import(compiledUrl('app/api/photos/cleanup/route.ts', { '@/lib/library-server': dataUrl('export async function libraryOwner() { return "owner"; } export function libraryError() { return new Response(null, { status: 503 }); }'), '@/lib/image-lifecycle': dataUrl('export async function cleanupPhotos() { throw new Error("must not run"); }') }));
  process.env.VERCEL = '1'; process.env.CRON_SECRET = 'x'.repeat(32);
  try {
    assert.equal((await route.GET(new Request('https://t/api/photos/cleanup'))).status, 401);
    assert.equal((await route.GET(new Request('https://t/api/photos/cleanup', { headers: { authorization: 'Bearer wrong' } }))).status, 401);
  } finally { delete process.env.VERCEL; delete process.env.CRON_SECRET; }
});

test('direct upload retries a busy library instead of failing the photo', async t => {
  const duplicateUrl = compiledUrl('lib/upload-duplicates.ts');
  const { uploadDirect } = await import(compiledUrl('lib/direct-upload.ts', { './upload-duplicates': duplicateUrl }));
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => ++calls === 1
    ? Response.json({ code: 'LIBRARY_BUSY', error: 'Thư viện đang được cập nhật.' }, { status: 409 })
    : Response.json({ mode: 'direct', photoId: 'p', ready: true }));
  const original = Object.getOwnPropertyDescriptor(globalThis, 'createImageBitmap');
  Object.defineProperty(globalThis, 'createImageBitmap', { configurable: true, value: async () => ({ width: 10, height: 10, close() {} }) });
  t.after(() => { if (original) Object.defineProperty(globalThis, 'createImageBitmap', original); else delete globalThis.createImageBitmap; });
  assert.equal(await uploadDirect(new File(['x'], 'a.jpg', { type: 'image/jpeg' }), 'album', crypto.randomUUID(), () => {}), true);
  assert.equal(calls, 2);
});

test('HEIC and other formats are queued for JPEG conversion instead of being blocked', async () => {
  const convertUrl = compiledUrl('lib/convert-image.ts');
  const { uploadFilename, needsJpegConversion } = await import(convertUrl);
  const queue = await import(compiledUrl('lib/upload-queue.ts', { './upload-duplicates': compiledUrl('lib/upload-duplicates.ts'), './convert-image': convertUrl }));
  const heic = new File(['heic bytes'], 'IMG_0001.HEIC', { type: 'image/heic' });
  const untyped = new File(['jpeg bytes'], 'scan.JPG', { type: '' });
  assert.equal(uploadFilename(heic), 'IMG_0001.jpg');
  assert.equal(needsJpegConversion(untyped), false);
  assert.equal(uploadFilename(new File(['x'], 'photo.tiff', { type: 'image/tiff' })), 'photo.jpg');
  const items = queue.createQueueItems([heic, new File(['gif'], 'loop.gif', { type: 'image/gif' }), new File(['x'], 'IMG_0001.jpg', { type: 'image/jpeg' })], 'album', [], new Map());
  assert.deepEqual(items.map(item => item.status), ['waiting', 'waiting', 'duplicate']);
  assert.equal(queue.createQueueItems([heic], 'album', [{ filename: 'img_0001.jpg', status: 'ready' }], new Map())[0].status, 'duplicate');
  assert.equal(queue.createQueueItems([new File([], 'empty.heic')], 'album', [], new Map())[0].status, 'failed');
});
