import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function moduleUrl(source) {
  return 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText).toString('base64');
}
const projectionUrl = moduleUrl(readFileSync('lib/public-library.ts', 'utf8'));
test('guest projection exposes ready photos without R2 keys, leases, hashes or failed uploads', async () => {
  const { publicLibrary } = await import(projectionUrl);
  const photo = { id:'photo', album:'wedding', filename:'one.jpg', alt:'One', width:10, height:10,
    takenAt:'today', key:'private/key', processingToken:'secret', sha256:'hash', uploadId:'upload' };
  const result = publicLibrary({ revision:12, settings:{title:'Wedding',adminName:'Private'},
    albums:[{slug:'wedding',name:'Wedding',time:'today'}], photos:[photo,
      {...photo,id:'ready',status:'ready'}, {...photo,id:'failed',status:'failed'},
      {...photo,id:'pending',status:'pending'}, {...photo,id:'deleted',status:'deleted'}, {...photo,id:'demo',demo:true}] });
  assert.deepEqual(result.photos.map(p=>p.id), ['photo','ready']);
  assert.equal(result.photos[0].src, '/api/library/photo/photo?variant=preview');
  for (const field of ['key','processingToken','sha256','uploadId']) assert.equal(field in result.photos[0],false);
  assert.equal(result.settings.adminName,'');
});
test('anonymous gallery returns data and conditional refresh returns 304', async () => {
  const server = moduleUrl(`export async function readSharedLibrary(){return {revision:9,settings:{title:'Wedding'},albums:[],photos:[]}}; export function libraryError(){return new Response(null,{status:500})}`);
  const route = await import(moduleUrl(readFileSync('app/api/gallery/route.ts','utf8')
    .replace('@/lib/library-server',server).replace('@/lib/public-library',projectionUrl)));
  const response = await route.GET(new Request('https://test/api/gallery'));
  assert.equal(response.status,200);
  assert.equal((await response.json()).revision,9);
  const unchanged = await route.GET(new Request('https://test/api/gallery',{headers:{'If-None-Match':response.headers.get('etag')}}));
  assert.equal(unchanged.status,304);
  assert.equal(await unchanged.text(),'');
});
test('original download falls back to same-origin stream when R2 CORS blocks GET', async t => {
  const calls=[];
  t.mock.method(globalThis,'fetch',async url=>{calls.push(url);if(calls.length===1)throw new TypeError('CORS');return new Response('original')});
  const {fetchOriginal}=await import(moduleUrl(readFileSync('lib/fetch-original.ts','utf8')));
  assert.equal(await (await fetchOriginal('https://r2.example/photo','photo')).text(),'original');
  assert.deepEqual(calls,['https://r2.example/photo','/api/photos/photo/download']);
});
