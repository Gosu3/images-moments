import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

test('mobile retains the original when navigation consumes share activation, then saves without fetching again', async t => {
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
  await save.shareReadyDownload();
  assert.equal(requests, 1);
  assert.equal(saved.name, 'first-photo.jpg');
  assert.equal(await saved.text(), 'original bytes');
  assert.equal(save.getReadyDownload(), null);
});
