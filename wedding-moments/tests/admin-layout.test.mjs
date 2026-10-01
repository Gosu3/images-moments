import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('mobile admin reserves an intrinsic menu row and puts spare height below it', () => {
  const css = readFileSync('app/gallery-admin.css', 'utf8');
  const mobile = css.slice(css.lastIndexOf('@media(max-width:850px)'));
  assert.match(mobile, /grid-template-rows:max-content minmax\(0,1fr\)/);
  assert.match(mobile, /\.admin-sidebar\{align-self:start;height:auto/);
  assert.match(mobile, /\.admin-main\{align-self:stretch/);
  assert.match(mobile, /overflow-anchor:none/);
  assert.match(mobile, /\.admin-content\{padding:14px 12px 32px/);
});
