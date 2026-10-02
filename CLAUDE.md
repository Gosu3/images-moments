# CLAUDE.md — Project map

Wedding photo gallery "Văn Thọ & Hồng Thắm". UI text is Vietnamese; keep it that way.

## Repo layout
- Git root = this folder. Local branch `master` tracks `origin/main` (github.com/Gosu3/images-moments). Push with `git push origin master:main`.
- App lives in `wedding-moments/` — run all npm commands there.
- `wedding-moments/.git` is an empty, foreign-owned nested repo (no commits). Ignore it; always use the outer repo.
- `HANDOFF-2026-09-29.md` — latest handoff: decisions, verified items, open TODOs.
- Production: https://images-moments.vercel.app (Vercel).

## Stack
Next.js 16 App Router + React 19, strict TS, Tailwind 4 + shadcn (`components/ui/*` = generated, don't edit casually), Zod, sharp, fflate (client ZIP), qrcode.
Two runtimes:
- **Vercel (production)**: `next build --webpack` (vercel.json). `next.config.ts` swaps `cloudflare:workers` → `lib/vercel-bindings.ts` (empty env), so D1/R2 bindings are unavailable; must use `LIBRARY_DATABASE=supabase` + `ORIGINAL_STORAGE=s3`.
- **Local / ChatGPT Sites**: `npm run dev` → vinext + Vite + Miniflare on :5173 with D1 `DB` / R2 `BUCKET` bindings (`.openai/hosting.json`, `vite.config.ts`, `build/sites-vite-plugin.ts` is source, not output).

## Data model & flow
- Whole library = one JSON doc per owner (`lib/library-model.ts`: albums, photos, settings, revision). Stored in Supabase `wm_libraries` (CAS via RPC `wm_save_library`, migration `supabase/migrations/202609290001_library_storage.sql`) or D1 `libraries`. `202609280001_initial_schema.sql` and `db/`, `drizzle/` are unused prototypes.
- `lib/library-server.ts`: `readLibrary` / `mutateLibrary` (optimistic revision + retry), `libraryOwner` (auth + same-origin check for writes), `readSharedLibrary` (Vercel guests read owner `vercel-admin`, 2s coalesced).
- Auth (`app/chatgpt-auth.ts`): on Vercel = HMAC cookie `wm_admin` from `lib/admin-session.ts` (`ADMIN_PASSWORD`, `AUTH_SECRET`, `/admin/login`, `/api/admin/session`); elsewhere = trusted `oai-authenticated-*` headers.
- Guest: `/api/gallery` → `lib/public-library.ts` (ready photos only, no keys/hashes), ETag/304; client `lib/use-library.ts` polls 3s (admin `/api/library` 5s).
- Upload (r2-direct, `ORIGINAL_STORAGE=s3`): admin dashboard → `/api/uploads/presign` (`beginUpload` in `lib/image-lifecycle.ts`, duplicate filename check `lib/upload-duplicates.ts`) → browser PUT to R2 (`lib/direct-upload.ts`, concurrency 4, queue `lib/upload-queue.ts`) → `/api/uploads/finalize` (HEAD check) → `after()` builds WebP thumbnail 640/preview 2400 (`lib/gallery-preview.ts`, stored next to original as `{key}.wm-{variant}-v2.webp`, regenerated on view if missing). Legacy proxy upload: `/api/library/upload`.
- `IMAGE_PIPELINE=r2-v2` + `workers/images/` (separate Cloudflare Worker) is an optional, not-rolled-out pipeline. Default `legacy`. See `docs/IMAGE-PIPELINE-VI.md`.
- Delivery: `/api/library/photo/[id]?variant=thumbnail|preview` — for s3 photos with a generated variant it 302-redirects to a signed R2 URL that is stable per 6h window (`cacheableVariantUrl`), public CDN cache on Vercel; otherwise streams/generates. `/api/gallery` has `s-maxage=2` on Vercel; guest polling backs off 3s→10s→20s when idle (`lib/poll-delay.ts`).
- Upload accepts any format: `lib/convert-image.ts` converts non JPEG/PNG/WebP (HEIC via native decode or lazy `heic-to/next`) to JPEG in the browser, one at a time; duplicate checks use `uploadFilename()` (IMG.HEIC → IMG.jpg). Server still only accepts JPEG/PNG/WebP.
- Finalize also checks magic bytes (`readOriginalHeader` + `validImageHeader`). `R2_UPLOAD_CHECKSUM=true` signs `x-amz-checksum-sha256` (needs bucket CORS header). `LIBRARY_BUSY` 409s are retried by `lib/direct-upload.ts`.
- `/api/photos/inventory` (admin GET, read-only) diffs R2 vs library. Vercel Cron (`vercel.json`, needs `CRON_SECRET`) GETs `/api/photos/cleanup`, purging only tombstones older than 7 days.
- Downloads `/api/photos/[id]/download`, `/api/download`; mobile save logic `lib/save-photo.ts`; deletion = tombstone + manual `/api/photos/cleanup`.

## UI entry points
- `app/page.tsx` → `components/home-album-tabs.tsx`; `app/album/[slug]` → `gallery-experience.tsx` + `photo-viewer.tsx` (swipe, slideshow, `?photo=<id>` deep link); `app/favorites` (localStorage, `lib/favorites.ts`); `app/admin` → `components/admin-dashboard.tsx` (largest file); `app/qr/[scope]/[id]` + `/api/qr` (`lib/app-url.ts`).
- Styles: `app/globals.css`, `app/gallery-admin.css`. `/access` just redirects home.
- `lib/mock-data.ts` still provides the `Photo` type and default album list — in use, don't delete.

## Commands (in `wedding-moments/`)
`npm run typecheck` · `npm test` (node --test, 43 tests) · `npm run lint` (known `<img>` warnings) · `npm run build`

## Gotchas
- Many tests in `tests/*.test.mjs` are **regex guards on source text** (e.g. `loading={index<12?"eager":"lazy"}`, `createQueueItems(Array.from(files)`, `scheduleLibraryReload()`). Run `npm test` after any edit to those components/libs.
- Never put secrets in `NEXT_PUBLIC_*`; `.env.local` is gitignored — don't print or commit it.
- When searching, exclude `node_modules`, `.npm-cache`, `.wrangler`, `.sites-runtime` (huge; plain `grep -r` hangs).
- Docs partly outdated: README (Supabase Auth, PIN `/access`, guest_sessions), `docs/LIBRARY.md` and `docs/SETUP-STORAGE-VI.md` (say guests see only demo data / D1 default) predate the Vercel guest gallery. Trust code + HANDOFF over these.
