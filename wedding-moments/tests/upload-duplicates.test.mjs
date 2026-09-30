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
const duplicateUrl = compiledUrl('lib/upload-duplicates.ts');
const { DuplicateUploadError } = await import(duplicateUrl);
const queue = await import(compiledUrl('lib/upload-queue.ts', { './upload-duplicates': duplicateUrl }));
const file = name => new File(['original bytes'], name, { type: 'image/jpeg' });

test('duplicate filenames across albums and within selections never enter upload work', () => {
  const reservations = new Map();
  const items = queue.createQueueItems([file('EXISTING.JPG'), file('new.jpg'), file('NEW.JPG'), file('Thọ.jpg'), file('Thọ.jpg')], 'album-b', [{ filename: 'existing.jpg', album: 'album-a', status: 'ready' }], reservations, 1000);
  assert.deepEqual(items.map(item => item.status), ['duplicate', 'waiting', 'duplicate', 'waiting', 'duplicate']);
  assert.deepEqual(items.filter(item => item.status === 'waiting').map(item => item.file.name), ['new.jpg', 'Thọ.jpg']);
  assert.equal(items[0].duplicateAt, 1000);
  assert.equal(reservations.size, 2);
  assert.equal(queue.createQueueItems([file('new.jpg')], 'album-b', [], reservations)[0].status, 'duplicate');
  assert.equal(queue.createQueueItems([file('removed.jpg')], 'album-a', [{ filename: 'removed.jpg', status: 'deleted' }], reservations)[0].status, 'waiting');
});

test('duplicate queue entries expire individually at five minutes; uploads and other entries survive', () => {
  const items = queue.createQueueItems([file('a.jpg'), file('b.jpg')], 'album', [{ filename: 'a.jpg' }, { filename: 'b.jpg' }], new Map(), 1000);
  items[1].duplicateAt = 2000;
  const waiting = { ...items[0], id: 'waiting', status: 'waiting' };
  const uploading = { ...waiting, id: 'uploading', status: 'uploading', progress: 72 };
  const all = [...items, waiting, uploading];
  assert.equal(queue.pruneDuplicateQueue(all, 1000 + queue.DUPLICATE_QUEUE_TTL - 1), all);
  assert.deepEqual(queue.pruneDuplicateQueue(all, 1000 + queue.DUPLICATE_QUEUE_TTL).map(item => item.id), [items[1].id, 'waiting', 'uploading']);
  assert.deepEqual(queue.pruneDuplicateQueue(all, 2000 + queue.DUPLICATE_QUEUE_TTL).map(item => item.id), ['waiting', 'uploading']);
  const manuallyRemoved = all.filter(item => item.id !== items[0].id);
  assert.deepEqual(queue.pruneDuplicateQueue(manuallyRemoved, 2000 + queue.DUPLICATE_QUEUE_TTL).map(item => item.id), ['waiting', 'uploading']);
});

const stateUrl = dataUrl(`
 export const state = { direct: true, library: { photos: [], albums: [{ slug: 'album-a' }, { slug: 'album-b' }] }, signed: [], writes: [] };
 export class LibraryError extends Error { constructor(message, status = 503, code) { super(message); this.status = status; this.code = code; } }
 export async function mutateLibrary(owner, update) { update(state.library); return structuredClone(state.library); }
 export async function readLibrary() { return structuredClone(state.library); }
 export async function libraryOwner() { return 'owner'; }
 export function libraryError(error) { return Response.json({ error: error.message, code: error.code }, { status: error.status || 503 }); }
 export function imagePipelineEnabled() { return false; }
 export function directR2Enabled() { return state.direct; }
 export function imagesEnabled() { return false; }
 export function originalsBucket() { return 'bucket'; }
 export async function imageServiceCall() { throw new Error('Unexpected worker call'); }
 export async function createR2SignedUrl(input) { state.signed.push(input); return 'https://r2.example/upload'; }
 export async function putOriginal(key) { state.writes.push(key); return 'binding'; }
 export async function headOriginal() { throw new Error('Unexpected storage read'); }
 export async function removeUncommittedOriginal() {}
 export function galleryVariantKey() { return 'unused'; }
 export async function uploadPreview() {}
 export const UPLOAD_TTL = 900, MAX_ORIGINAL_SIZE = 50 * 1024 * 1024;
 export function validImageHeader() { return true; }
`);
const { state } = await import(stateUrl);
const lifecycleImports = Object.fromEntries(['./library-server', './image-service', './r2-presign', './image-protocol', './cloud-config', './original-storage', './gallery-preview'].map(name => [name, stateUrl]));
const { beginUpload } = await import(compiledUrl('lib/image-lifecycle.ts', { ...lifecycleImports, './upload-duplicates': duplicateUrl, zod: pathToFileURL(require.resolve('zod')).href }));
const input = (filename, uploadId = crypto.randomUUID()) => ({ album: 'album-a', filename, uploadId, contentType: 'image/jpeg', size: 14, sha256: 'a'.repeat(64), width: 100, height: 100 });

test('server prevents duplicate R2 tickets across tabs and permits retries of the same upload', async () => {
  state.direct = true; state.library.photos = [{ filename: 'existing.jpg', album: 'album-b', status: 'ready' }]; state.signed.length = 0;
  await assert.rejects(beginUpload('owner', input('EXISTING.JPG')), error => error.code === 'DUPLICATE_FILENAME' && error.status === 409);
  assert.equal(state.signed.length, 0);
  const first = input('new.jpg'), second = input('NEW.JPG');
  const results = await Promise.allSettled([beginUpload('owner', first), beginUpload('owner', second)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.code, 'DUPLICATE_FILENAME');
  assert.equal(state.signed.length, 1);
  assert.equal(state.library.photos.length, 2);
  const accepted = results[0].status === 'fulfilled' ? first : second;
  const retry = await beginUpload('owner', accepted);
  assert.equal(retry.mode, 'direct');
  assert.equal(state.library.photos.length, 2);
  const photo = state.library.photos.find(p => p.uploadId === accepted.uploadId);
  photo.status = 'ready';
  assert.equal((await beginUpload('owner', accepted)).ready, true);
});

test('direct upload reports duplicates before sending any bytes to R2', async t => {
  const { uploadDirect } = await import(compiledUrl('lib/direct-upload.ts', { './upload-duplicates': duplicateUrl }));
  const calls = [];
  t.mock.method(globalThis, 'fetch', async url => { calls.push(url); return Response.json({ code: 'DUPLICATE_FILENAME', error: 'Trùng lặp' }, { status: 409 }); });
  const original = Object.getOwnPropertyDescriptor(globalThis, 'createImageBitmap');
  Object.defineProperty(globalThis, 'createImageBitmap', { configurable: true, value: async () => ({ width: 100, height: 100, close() {} }) });
  t.after(() => { if (original) Object.defineProperty(globalThis, 'createImageBitmap', original); else delete globalThis.createImageBitmap; });
  await assert.rejects(uploadDirect(file('existing.jpg'), 'album-a', crypto.randomUUID(), () => {}), DuplicateUploadError);
  assert.deepEqual(calls, ['/api/uploads/presign']);
});

const legacyImports = Object.fromEntries(['@/lib/library-server', '@/lib/original-storage', '@/lib/cloudflare-images', '@/lib/cloud-config', '@/lib/image-upload', '@/lib/image-service'].map(name => [name, stateUrl]));
const { POST: legacyUpload } = await import(compiledUrl('app/api/library/upload/route.ts', { ...legacyImports, '@/lib/upload-duplicates': duplicateUrl }));
function legacyRequest(filename, uploadId = crypto.randomUUID()) {
  const form = new FormData(); form.set('file', file(filename)); form.set('album', 'album-a'); form.set('uploadId', uploadId); form.set('width', '100'); form.set('height', '100');
  return new Request('https://photos.example/api/library/upload', { method: 'POST', body: form });
}
test('legacy uploads reserve names before storage and preserve idempotent retries', async () => {
  state.direct = false; state.library.photos = [{ filename: 'existing.jpg', album: 'album-b', status: 'ready' }]; state.writes.length = 0;
  const duplicate = await legacyUpload(legacyRequest('EXISTING.JPG'));
  assert.equal(duplicate.status, 409);
  assert.equal((await duplicate.json()).code, 'DUPLICATE_FILENAME');
  assert.equal(state.writes.length, 0);
  const id = crypto.randomUUID();
  const results = await Promise.all([legacyUpload(legacyRequest('new.jpg', id)), legacyUpload(legacyRequest('NEW.JPG'))]);
  assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
  assert.equal(state.writes.length, 1);
  assert.equal((await legacyUpload(legacyRequest('new.jpg', id))).status, 201);
  assert.equal(state.writes.length, 1);
});
