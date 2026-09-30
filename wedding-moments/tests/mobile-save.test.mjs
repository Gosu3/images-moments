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
    saved = files[0];
  }}});
  assert.equal(await save.savePhotoToDevice('/original', 'first-photo.jpg'), 'ready');
  assert.equal(save.getReadyDownload().name, 'first-photo.jpg');
  assert.equal(shares, 0);
  await save.shareReadyDownload();
  assert.equal(requests, 1);
  assert.equal(saved.name, 'first-photo.jpg');
  assert.equal(await saved.text(), 'original bytes');
  assert.equal(save.getReadyDownload(), null);

  // If Web Share is present but blocked, Save must trigger a file download.
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
  assert.equal(await save.shareReadyDownload(), 'downloaded');
  assert.equal(clicks, 1);
  assert.equal(save.getReadyDownload(), null);

  // A failed/invalid fetch must not expose a Save button for a broken file.
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, blob: async () => new Blob(['error'], { type: 'text/html' }) }));
  await assert.rejects(save.savePhotoToDevice('/original', 'broken.jpg'), /ảnh hợp lệ/);
  assert.equal(save.getReadyDownload(), null);
});
