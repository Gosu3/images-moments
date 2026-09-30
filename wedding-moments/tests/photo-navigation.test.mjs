import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync('lib/photo-navigation.ts', 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const exports = {};
new Function('exports', code)(exports);
const { resolvePhotoIndex } = exports;

test('favorites preview keeps its identity when earlier photos are removed or reordered', () => {
  const active = { id: 'b', index: 1 };
  assert.equal(resolvePhotoIndex([{ id: 'b' }, { id: 'c' }], active), 0);
  assert.equal(resolvePhotoIndex([{ id: 'c' }, { id: 'a' }, { id: 'b' }], active), 2);
});
test('removing the viewed favorite selects its nearest remaining neighbor without invalid indices', () => {
  assert.equal(resolvePhotoIndex([{ id: 'a' }, { id: 'c' }], { id: 'b', index: 1 }), 1);
  assert.equal(resolvePhotoIndex([{ id: 'a' }], { id: 'c', index: 2 }), 0);
  assert.equal(resolvePhotoIndex([], { id: 'a', index: 0 }), null);
  assert.equal(resolvePhotoIndex([{ id: 'a' }], null), null);
});
test('large favorite galleries resolve every photo rather than truncating the slideshow', () => {
  const photos = Array.from({ length: 250 }, (_, index) => ({ id: `photo-${index}` }));
  for (let index = 0; index < photos.length; index++) {
    assert.equal(resolvePhotoIndex(photos, { id: photos[index].id, index }), index);
  }
});
test('slideshow waits for image readiness and cleans up its timeout', () => {
  const gallery = readFileSync('components/gallery-experience.tsx', 'utf8');
  assert.match(gallery, /loadedPhotoId !== current.id && failedPhotoId !== current.id/);
  assert.match(gallery, /clearTimeout\(timer\)/);
  assert.match(gallery, /!pageVisible/);
  assert.match(gallery, /className="home-photo-grid gallery-photo-grid"/);
  const css = readFileSync('app/gallery-admin.css', 'utf8');
  assert.match(css, /\.lightbox\{translate:none!important;height:100dvh/);
  assert.match(css, /\.lightbox-stage img\{[^}]*object-fit:contain/);
});
test('only the chosen dashboard download icon gets the loading animation', () => {
  const home = readFileSync('components/home-album-tabs.tsx', 'utf8');
  assert.match(home, /className=\{downloading === photo.id \? "download-arrow-loading" : undefined\}/);
  const css = readFileSync('app/gallery-admin.css', 'utf8');
  assert.match(css, /\.home-photo-download:disabled\{cursor:default;opacity:1\}/);
  assert.doesNotMatch(css, /:disabled[^}]*animation/);
});
