import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

test('mobile prepares the original then shares only on a fresh Save tap without fetching again', async t => {
  const source = readFileSync('lib/save-photo.ts', 'utf8')
    .replace(/import \{ getOriginalDownloadEndpoint \} from "\.\/photo-urls";/, 'const getOriginalDownloadEndpoint = id => `/api/photos/${id}/download`;')
    .replace(/import \{ fetchOriginal \} from "\.\/fetch-original";/, 'const fetchOriginal = url => fetch(url);');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const save = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
  let requests = 0, shares = 0, saved;
  t.mock.method(globalThis, 'fetch', async () => { requests++; return { ok: true, blob: async () => new Blob(['original bytes'], { type: 'image/jpeg' }) }; });
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  t.after(() => Object.defineProperty(globalThis, 'navigator', descriptor));
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: 'iPhone', canShare: () => true, share: async ({ files }) => {
    shares++;
    if (shares === 1) throw new DOMException('Activation expired', 'NotAllowedError');
    saved = files[0];
  }}});
  assert.equal(await save.savePhotoToDevice('/original', 'first-photo.jpg'), 'ready');
  assert.equal(save.getReadyDownload().name, 'first-photo.jpg');
  assert.equal(shares, 1);
  await save.shareReadyDownload();
  assert.equal(requests, 1);
  assert.equal(saved.name, 'first-photo.jpg');
  assert.equal(await saved.text(), 'original bytes');
  assert.equal(save.getReadyDownload(), null);

  // A blocked share must retain the file and never silently download it.
  let clicks = 0;
  const docDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  t.after(() => { if (docDescriptor) Object.defineProperty(globalThis, 'document', docDescriptor); else delete globalThis.document; });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    querySelector: () => null, body: { appendChild() {} },
    createElement: () => ({ click() { clicks++; }, remove() {} }),
  }});
  t.mock.method(globalThis, 'setTimeout', () => 0);
  navigator.share = async () => { throw new DOMException('Blocked', 'NotAllowedError'); };
  await save.savePhotoToDevice('/original', 'second-photo.jpg');
  await assert.rejects(save.shareReadyDownload(), { name: 'NotAllowedError' });
  assert.equal(clicks, 0);
  assert.equal(save.getReadyDownload().name, 'second-photo.jpg');
  save.clearReadyDownload();

  // Opening preview prepares the exact original for a one-tap native share.
  navigator.share = async ({ files }) => { saved = files[0]; };
  await save.preparePreviewDownload({ id: 'preview-photo', src: '/api/photo', filename: 'preview.jpg' });
  const beforeSave = requests;
  assert.equal(await save.downloadOriginal({ id: 'preview-photo', src: '/api/photo', filename: 'preview.jpg' }), 'shared');
  assert.equal(requests, beforeSave);
  assert.equal(saved.name, 'preview.jpg');

  // A failed/invalid fetch must not expose a Save button for a broken file.
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, blob: async () => new Blob(['error'], { type: 'text/html' }) }));
  await assert.rejects(save.savePhotoToDevice('/original', 'broken.jpg'), /ảnh hợp lệ/);
  assert.equal(save.getReadyDownload(), null);
});
