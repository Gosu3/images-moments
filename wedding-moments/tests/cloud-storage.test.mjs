import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import ts from 'typescript';

const config = { SUPABASE_URL: 'https://unit-test.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_test', R2_ACCOUNT_ID: 'a'.repeat(32),
  R2_BUCKET_NAME: 'private-test', R2_ACCESS_KEY_ID: 'test-access', R2_SECRET_ACCESS_KEY: 'test-secret',
  CF_IMAGES_ACCOUNT_ID: 'a'.repeat(32), CF_IMAGES_API_TOKEN: 'test-token', CF_IMAGE_ACCOUNT_HASH: 'test-hash', CF_IMAGE_SIGNING_KEY: 'test-signing' };
const configUrl = 'data:text/javascript;base64,' + Buffer.from(`export const setting = name => (${JSON.stringify(config)})[name] || ''; export const imagesEnabled = () => true;`).toString('base64');
async function load(name) {
  const source = readFileSync(`lib/${name}.ts`, 'utf8').replace(/from "\.\/cloud-config"/g, `from "${configUrl}"`);
  return import('data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64'));
}

test('R2 signing restricts host, key, method and content type; signature independently matches', async () => {
  const { createR2SignedUrl } = await load('r2-presign');
  const url = new URL(await createR2SignedUrl({ method: 'PUT', key: 'owner/a b.jpg', contentType: 'image/jpeg', expires: 300 }));
  assert.equal(url.host, `${'a'.repeat(32)}.r2.cloudflarestorage.com`);
  assert.equal(url.pathname, '/private-test/owner/a%20b.jpg');
  const signature = url.searchParams.get('X-Amz-Signature'); url.searchParams.delete('X-Amz-Signature');
  const timestamp = url.searchParams.get('X-Amz-Date'), date = timestamp.slice(0, 8), scope = `${date}/auto/s3/aws4_request`;
  const canonical = ['PUT', url.pathname, url.searchParams.toString(), `content-type:image/jpeg\nhost:${url.host}\n`, 'content-type;host', 'UNSIGNED-PAYLOAD'].join('\n');
  const digest = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical))).toString('hex');
  let key = Buffer.from('AWS4test-secret');
  for (const part of [date, 'auto', 's3', 'aws4_request']) key = createHmac('sha256', key).update(part).digest();
  assert.equal(signature, createHmac('sha256', key).update(['AWS4-HMAC-SHA256', timestamp, scope, digest].join('\n')).digest('hex'));
});

test('Supabase reads scoped metadata and uses server-only secret; CAS conflict is false', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url, init });
    return Response.json(init.method === 'POST' ? false : [{ data: { photos: [], albums: [], settings: {} }, revision: 7 }]);
  });
  const { readSupabaseLibrary, saveSupabaseLibrary } = await load('supabase-library');
  const library = await readSupabaseLibrary('owner-test');
  assert.equal(library.revision, 7);
  assert.equal(new URL(calls[0].url).searchParams.get('owner'), 'eq.owner-test');
  assert.equal(calls[0].init.headers.get('apikey'), 'sb_secret_test');
  assert.equal(calls[0].init.headers.has('authorization'), false);
  assert.equal(await saveSupabaseLibrary('owner-test', library, 7), false);
  assert.deepEqual(JSON.parse(calls[1].init.body), { p_owner: 'owner-test', p_data: library, p_revision: 7 });
});

test('Supabase errors never silently return a new demo library', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('failure', { status: 503 }));
  const { readSupabaseLibrary } = await load('supabase-library');
  await assert.rejects(readSupabaseLibrary('owner'), /503/);
});

test('Images upload requests private access; delivery signature and expiry match', async t => {
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(init.body.get('requireSignedURLs'), 'true');
    assert.equal(init.headers.Authorization, 'Bearer test-token');
    return Response.json({ success: true, result: { id: 'image-test' } });
  });
  const { uploadPreview, signedPreviewUrl } = await load('cloudflare-images');
  assert.equal(await uploadPreview(new File(['preview'], 'preview.jpg', { type: 'image/jpeg' })), 'image-test');
  const url = new URL(await signedPreviewUrl('image-test'));
  assert.equal(url.pathname, '/test-hash/image-test/thumbnail');
  const signature = url.searchParams.get('sig'); url.searchParams.delete('sig');
  assert.equal(signature, createHmac('sha256', 'test-signing').update(url.pathname + '?' + url.searchParams).digest('hex'));
  assert.ok(Number(url.searchParams.get('exp')) > Date.now() / 1000);
});

test('Images rejects oversized previews before network access', async t => {
  t.mock.method(globalThis, 'fetch', () => { throw new Error('must not fetch'); });
  const { uploadPreview } = await load('cloudflare-images');
  await assert.rejects(uploadPreview(new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.jpg')), /limit/);
});

test('image upload rejects mismatched signatures', async () => {
  const { validImageHeader } = await load('image-upload');
  assert.equal(validImageHeader(new Uint8Array([255, 216, 255, 224]), 'image/jpeg'), true);
  assert.equal(validImageHeader(new TextEncoder().encode('<script>test</script>'), 'image/jpeg'), false);
  assert.equal(validImageHeader(new Uint8Array([137, 80, 78, 71]), 'image/png'), false);
});
