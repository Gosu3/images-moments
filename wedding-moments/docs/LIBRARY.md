# Library administration

Optional Supabase + external R2 + Cloudflare Images integration is now available.
See [the setup guide](./SETUP-STORAGE-VI.md) before selecting providers; defaults
remain D1 and the existing R2 binding. No automatic data migration is performed.

The six admin sections use `/api/library`, backed by the Sites D1 binding `DB`.
Original JPEG, PNG and WebP uploads use the R2 binding `BUCKET`; all records and
image reads are scoped to the authenticated ChatGPT user. A visitor without a
session can see the demo layout but cannot write or read private uploads.
This is a private per-user library, not a shared wedding guest publishing system.

The initial images are demo duplicates, not 1,137 distinct wedding photographs.
Upload originals in **Tải lên**, then manage albums, move photos, or remove demo
entries in **Ảnh**. The name defaults to **Thọ Nguyễn**. Settings and album
changes persist; the download history is intentionally session-only.

Removing photos removes metadata only. Original objects remain in R2 for manual
recovery; there is currently no restore UI or automatic retention cleanup.

## Verification

Run `npm run typecheck`, `npm test`, and `npm run build`.
Apply the generated migration to local D1 once, then run `npm start -- --port 5175`
and `node scripts/check-library.mjs`. The integration test uses a unique synthetic
local user and a generated 1-pixel image; it never runs against production. Test
records and retained objects are isolated in `.wrangler/state`.

Production requires the existing Site's DB/BUCKET bindings, the committed D1
migration, and trusted platform authentication headers. Never expose the local
preview directly to the internet: its test auth headers are not verified by the
local server. Site lookup currently returns NOT_FOUND, so this update has not
been deployed or migrated on the production Site.
