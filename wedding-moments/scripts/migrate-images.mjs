// Dry-run by default. Never deletes old storage. Secrets only via environment.
import { appendFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
const base = new URL(process.env.MIGRATION_APP_URL || 'http://127.0.0.1:5175');
const local = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
if (!local && base.protocol !== 'https:') throw new Error('Remote migration requires HTTPS');
const headers = { Origin: base.origin };
if (process.env.MIGRATION_COOKIE) headers.Cookie = process.env.MIGRATION_COOKIE;
else if (local && process.env.MIGRATION_LOCAL_USER) {
  headers['oai-authenticated-user-id'] = process.env.MIGRATION_LOCAL_USER;
  headers['oai-authenticated-user-email'] = 'migration@example.invalid';
} else throw new Error('Use an existing authenticated session via MIGRATION_COOKIE, or local test user via MIGRATION_LOCAL_USER. Never commit either.');
const apply = process.argv.includes('--apply');
if (process.argv.includes('--cleanup')) {
  const response = await fetch(new URL('/api/photos/cleanup', base), { method: 'POST', redirect: 'error', headers });
  if (!response.ok) throw new Error(`Cleanup HTTP ${response.status}`);
  console.log(JSON.stringify(await response.json()));
  process.exit(0);
}
const log = resolve('work/image-migration.jsonl');
if (apply) mkdirSync(dirname(log), { recursive: true });
// Dry-run writes no files.
const completed = new Set(existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)).filter(row => row.status === 'migrated' && row.origin === base.origin).map(row => row.id) : []);
async function request(path, body) {
  const response = await fetch(new URL(path, base), { method: body ? 'POST' : 'GET', redirect: 'error', headers: { ...headers, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(240000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`); // Never log URLs with credentials or response bodies.
  return response.json();
}
const inventory = await request('/api/photos/migrate');
console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', total: inventory.total, demo: inventory.demo, migrated: inventory.migrated, candidates: inventory.photos.length }));
let failures = 0;
for (const photo of inventory.photos) {
  if (completed.has(photo.id)) continue;
  if (!apply) { console.log(JSON.stringify({ id: photo.id, storage: photo.storage, action: 'copy-and-verify' })); continue; }
  let success = false;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await request('/api/photos/migrate', { id: photo.id, dryRun: false });
      appendFileSync(log, JSON.stringify({ at: new Date().toISOString(), origin: base.origin, ...result }) + '\n');
      console.log(JSON.stringify({ id: photo.id, status: result.status })); success = true; break;
    } catch (error) {
      appendFileSync(log, JSON.stringify({ at: new Date().toISOString(), origin: base.origin, id: photo.id, status: 'failed', attempt, error: error.message }) + '\n');
      // A processing lease may still be active after a timeout. Resume on a later
      // run; don't hold this process for minutes or start concurrent jobs.
      if (error.message === 'HTTP 409') break;
      if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 1500 * attempt));
    }
  }
  if (!success) failures++;
}
process.exitCode = failures ? 1 : 0;
