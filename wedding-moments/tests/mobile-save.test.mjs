import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

test('mobile downloads after changing viewer without a second website Save tap', async t => {
  const source = readFileSync('lib/save-photo.ts', 'utf8')
    .replace(/import \{ getOriginalDownloadEndpoint \} from "\.\/photo-urls";/, 'const getOriginalDownloadEndpoint = id => `/api/photos/${id}/download`;')
    .replace(/import \{ fetchOriginal \} from "\.\/fetch-original";/, 'const fetchOriginal = url => fetch(url);');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const save = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
  const restore = (name, value) => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    t.after(() => { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; });
    Object.defineProperty(globalThis, name, { configurable: true, value });
  };
  let requests = 0, saved, dialog = null, finishFetch;
  const clicked = [], attached = [], blobs = [];
  restore('navigator', { userAgent: 'iPhone', canShare: () => true, share: async () => {
    throw new DOMException('Activation expired', 'NotAllowedError');
  }});
  restore('document', {
    querySelector: () => dialog,
    body: { appendChild: () => attached.push('body') },
    createElement: () => ({ click() { clicked.push(this.download); }, remove() {} }),
  });
  t.mock.method(globalThis, 'setTimeout', () => 0);
  t.mock.method(URL, 'createObjectURL', blob => { blobs.push(blob); return 'blob:original'; });
  t.mock.method(globalThis, 'fetch', async () => {
    requests++;
    await new Promise(resolve => { finishFetch = resolve; });
    return { ok: true, blob: async () => new Blob(['first original bytes'], { type: 'image/jpeg' }) };
  });
  const pending = save.savePhotoToDevice('/first-original', 'first-photo.jpg');
  // Viewing another image must not cancel, replace, or park the first download.
  dialog = { appendChild: () => attached.push('second-photo-dialog') };
  finishFetch();
  assert.equal(await pending, 'downloaded');
  assert.deepEqual(clicked, ['first-photo.jpg']);
  assert.deepEqual(attached, ['second-photo-dialog']);
  assert.equal(await blobs[0].text(), 'first original bytes');
  assert.equal(requests, 1);
  assert.equal('getReadyDownload' in save, false);

  t.mock.method(globalThis, 'fetch', async () => { requests++; return { ok: true, blob: async () => new Blob(['original bytes'], { type: 'image/jpeg' }) }; });
  navigator.share = async () => { throw new DOMException('Another sheet is open', 'InvalidStateError'); };
  assert.equal(await save.savePhotoToDevice('/original', 'second-photo.jpg'), 'downloaded');
  assert.deepEqual(clicked, ['first-photo.jpg', 'second-photo.jpg']);

  // Respect intentional cancellation of the native sheet.
  navigator.share = async () => { throw new DOMException('Cancelled', 'AbortError'); };
  await assert.rejects(save.savePhotoToDevice('/original', 'cancelled.jpg'), { name: 'AbortError' });
  assert.equal(clicked.length, 2);

  // A cached original opens native share without another fetch.
  navigator.share = async ({ files }) => { saved = files[0]; };
  await save.preparePreviewDownload({ id: 'preview-photo', src: '/api/photo', filename: 'preview.jpg' });
  const beforeSave = requests;
  assert.equal(await save.downloadOriginal({ id: 'preview-photo', src: '/api/photo', filename: 'preview.jpg' }), 'shared');
  assert.equal(requests, beforeSave);
  assert.equal(saved.name, 'preview.jpg');
  assert.equal(await saved.text(), 'original bytes');

  // New R2 originals also prepare a File for native sharing in preview.
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push([url, options?.method]);
    return url.startsWith('/api/')
      ? { ok: true, json: async () => ({ url: 'https://r2.example/original', filename: 'r2-original.jpg' }) }
      : { ok: true, blob: async () => new Blob(['R2 original bytes'], { type: 'image/jpeg' }) };
  });
  const r2Photo = { id: 'r2-photo', src: '/api/photo', pipeline: 'r2-v2', filename: 'r2-original.jpg' };
  await save.preparePreviewDownload(r2Photo);
  assert.equal(await save.downloadOriginal(r2Photo), 'shared');
  assert.deepEqual(calls, [['/api/photos/r2-photo/download', 'POST'], ['https://r2.example/original', undefined]]);
  assert.equal(saved.name, 'r2-original.jpg');
  assert.equal(await saved.text(), 'R2 original bytes');

  navigator.canShare = () => false;
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, blob: async () => new Blob(['original'], { type: 'image/jpeg' }) }));
  assert.equal(await save.savePhotoToDevice('/original', 'unsupported.jpg'), 'downloaded');
  assert.equal(clicked.at(-1), 'unsupported.jpg');
  const beforeInvalid = clicked.length;
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, blob: async () => new Blob(['error'], { type: 'text/html' }) }));
  await assert.rejects(save.savePhotoToDevice('/original', 'broken.jpg'), /ảnh hợp lệ/);
  assert.equal(clicked.length, beforeInvalid);
});
