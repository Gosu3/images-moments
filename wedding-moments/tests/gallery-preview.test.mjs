import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import sharp from 'sharp';

class LibraryError extends Error { constructor(message, status) { super(message); this.status = status; } }
function load(storage) {
  const source = readFileSync('lib/gallery-preview.ts', 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const exports = {};
  new Function('require', 'exports', code)(name => name === 'sharp' ? sharp : name === './original-storage' ? storage : { LibraryError }, exports);
  return exports;
}
test('gallery variants are bounded WebP images while source bytes remain unchanged', async () => {
  const source = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#123456' } }).jpeg().toBuffer();
  const saved = Buffer.from(source);
  const { resizeGalleryImage } = load({});
  for (const [variant, bound] of [['thumbnail', 640], ['preview', 2400]]) {
    const output = await resizeGalleryImage(source, variant);
    const metadata = await sharp(output).metadata();
    assert.equal(metadata.format, 'webp'); assert.equal(metadata.width, bound);
    assert.ok(metadata.height <= bound); assert.ok(output.length < source.length);
  }
  assert.deepEqual(source, saved);
});
test('thumbnail generation coalesces requests and uses persisted cache on later views', async () => {
  const source = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#abcdef' } }).jpeg().toBuffer();
  const objects = new Map([['owner/original', source]]); let sourceReads = 0; let writes = 0;
  const { getGalleryPreview } = load({
    getOriginal: async photo => {
      if (!objects.has(photo.key)) throw new LibraryError('missing', 404);
      if (photo.key === 'owner/original') sourceReads++;
      return new Response(objects.get(photo.key));
    },
    putOriginal: async (key, file, hash, storage) => { assert.equal(storage, 's3'); writes++; objects.set(key, new Uint8Array(await file.arrayBuffer())); },
  });
  const photo = { key: 'owner/original', storage: 's3' };
  const results = await Promise.all(Array.from({ length: 4 }, () => getGalleryPreview(photo, 'thumbnail')));
  assert.equal(sourceReads, 1); assert.equal(writes, 1);
  assert.ok((await results[0].arrayBuffer()).byteLength > 0);
  await getGalleryPreview(photo, 'thumbnail');
  assert.equal(sourceReads, 1); assert.equal(writes, 1);
  assert.deepEqual(objects.get('owner/original'), source);
});
test('storage authorization failure is not treated as a missing thumbnail', async () => {
  let writes = 0;
  const { getGalleryPreview } = load({ getOriginal: async () => { throw new LibraryError('denied', 403); }, putOriginal: async () => { writes++; } });
  await assert.rejects(getGalleryPreview({ key: 'x' }, 'thumbnail'), /denied/);
  assert.equal(writes, 0);
});
test('eager thumbnail and preview generation reads the original only once', async () => {
  const source = await sharp({ create: { width: 2600, height: 1800, channels: 3, background: '#345678' } }).jpeg().toBuffer();
  const objects = new Map([['owner/original', source]]); let sourceReads = 0;
  const { prepareGalleryPreviews } = load({
    getOriginal: async photo => {
      if (!objects.has(photo.key)) throw new LibraryError('missing', 404);
      if (photo.key === 'owner/original') sourceReads++;
      return new Response(objects.get(photo.key));
    },
    putOriginal: async (key, file) => objects.set(key, new Uint8Array(await file.arrayBuffer())),
  });
  await prepareGalleryPreviews({ key: 'owner/original', storage: 's3' });
  assert.equal(sourceReads, 1);
  assert.ok(objects.has('owner/original.wm-thumbnail-v2.webp'));
  assert.ok(objects.has('owner/original.wm-preview-v2.webp'));
});
