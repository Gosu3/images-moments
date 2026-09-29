# Security

> Đây là các yêu cầu thiết kế mục tiêu. Bản hiện tại dùng xác thực Sites,
> server-scoped Supabase JSONB và R2/Images riêng tư; chưa có Supabase Auth,
> guest PIN/rate-limit, quét malware hay xử lý EXIF server. Xem phạm vi thực tế
> trong [SETUP-STORAGE-VI.md](./SETUP-STORAGE-VI.md).

## Trust boundaries

Client input không đáng tin. API kiểm tra auth, ownership, schema, rate limit và trạng thái resource. Supabase RLS là lớp phòng thủ bổ sung, không thay thế authorization ở server.

## Secrets

R2 secret, Supabase service role, auth secret và pepper chỉ ở secret manager/server. Biến `NEXT_PUBLIC_*` chỉ chứa Supabase URL/anon key và CDN public base URL. Logs tự động redact token, cookie, PIN và signed query.

## Upload

- allowlist JPEG/PNG/WebP; HEIC chỉ khi processing pipeline được bật
- giới hạn 50 MB/file, batch/concurrency và quota/wedding
- presign gắn content type, object key server-generated, expiry 15 phút
- finalize kiểm magic bytes, size, checksum và dimensions; không tin extension
- ảnh lỗi/có malware ở trạng thái quarantine/failed, không qua CDN

## Access

Admin dùng Supabase Auth, MFA khuyến nghị, session Secure/HttpOnly. Password gallery hash Argon2id/bcrypt + server pepper; rate-limit và exponential backoff. Guest token lưu dạng hash, scope theo wedding/album, có expiry/revocation.

## Objects and URLs

Bucket original private; CORS chỉ domain ứng dụng. GET original ký 5 phút. Preview private dùng signed delivery token/cache policy cân bằng: token scope path, TTL vừa đủ, CDN cache variant nhưng authorization vẫn chặn metadata/discovery.

## Headers

Production bật CSP, HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` tối thiểu và chống framing. Public wedding có OG metadata; private wedding luôn `noindex,nofollow` và không đưa private photo vào sitemap.

## Incident/backup

Rotate credential khi nghi lộ, revoke guest sessions, vô hiệu signed keys, giữ audit log và đối soát R2 access logs. Backup được mã hóa, kiểm checksum và giới hạn người phục hồi.
