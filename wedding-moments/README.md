# Wedding Moments

Digital wedding gallery tối ưu cho việc lưu giữ, xem, chọn, chia sẻ và tải ảnh cưới. Ảnh gốc đi thẳng từ trình duyệt tới Cloudflare R2; giao diện chỉ nhận thumbnail/preview từ CDN.

## Stack

- Next.js App Router, React, strict TypeScript, Tailwind CSS
- Supabase PostgreSQL + Auth + Row Level Security
- Cloudflare R2 cho original, Cloudflare Image Transformations cho delivery
- Zod validation; Web Crypto cho R2 SigV4; QR tạo server-side

## Chạy local

Yêu cầu Node.js 22.13+.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Mở `http://localhost:5173`. Các route demo: `/`, `/album/le-thanh-hon`, `/favorites`, `/access` (PIN `1810`), `/admin`, `/qr/album/le-thanh-hon`.

## Kiểm tra

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Supabase

1. Tạo project Supabase và bật email auth cho admin.
2. Chạy migration trong `supabase/migrations` bằng Supabase CLI (`supabase db push`).
3. Điền URL, anon key và service-role key vào môi trường server. Service-role key không bao giờ được đưa vào client.
4. Production API phải tạo `guest_sessions` bằng cookie `HttpOnly`, `Secure`, `SameSite=Lax`; wedding/album password được hash bằng Argon2id hoặc bcrypt ở server.

## Cloudflare R2 và Images

1. Tạo bucket private `wedding-originals`, bật CORS chỉ cho domain ứng dụng và các method `PUT`, `HEAD` cần thiết.
2. Tạo R2 API token giới hạn vào đúng bucket; điền các biến `R2_*`.
3. Cấu hình custom domain/Cloudflare Image Transformations trước bucket. Original không public.
4. `POST /api/uploads/presign` cấp URL PUT 15 phút; browser upload trực tiếp. Sau upload, worker xác thực MIME thực tế/checksum, đọc dimensions/EXIF và cập nhật `photos.status`.
5. Preview dùng biến thể immutable; original chỉ có URL GET ký 5 phút.

## Deployment

Build chạy trên Cloudflare Workers/Vinext trong Sites hoặc deploy Next.js lên nền tảng tương thích. Worker tạo ZIP lớn nên là Cloudflare Queue/Container hoặc worker service riêng, không phải request web. Đặt toàn bộ secret trong secret manager của nền tảng.

## Cấu trúc chính

```text
app/                 routes, API handlers
components/          gallery, lightbox, admin/upload UI
lib/                 mock data, R2 signing
supabase/migrations/ PostgreSQL schema + RLS
docs/                architecture, storage, performance, security
tests/               smoke/architecture/performance guards
public/              optimized demo assets only
```

## Backup

R2 không nên là bản duy nhất. Bật object versioning/lifecycle phù hợp, đồng bộ định kỳ sang storage thứ hai hoặc NAS/offline drive đã mã hóa, và diễn tập restore theo quý. Giữ ít nhất một bản sao offline của original.

Xem thêm: [Architecture](docs/ARCHITECTURE.md), [Storage](docs/STORAGE.md), [Performance](docs/PERFORMANCE.md), [Security](docs/SECURITY.md).
