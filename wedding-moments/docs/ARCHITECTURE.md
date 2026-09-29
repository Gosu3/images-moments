# Architecture

## Quyết định

Next.js chịu trách nhiệm UI, authorization, metadata và business logic. Supabase là nguồn dữ liệu quan hệ và danh tính admin. R2 giữ byte gốc. Cloudflare CDN/Image Transformations cung cấp biến thể ảnh. Lựa chọn này tránh biến application server thành image server và giữ đường dữ liệu lớn ngoài serverless runtime.

## Luồng hệ thống

```text
Browser ──metadata/actions──> Next.js ──SQL/Auth──> Supabase
   │                            │
   ├──presigned PUT────────────>│ (chỉ cấp quyền)
   └──image bytes──────────────> R2 <──transform/cache── Cloudflare CDN
```

## Upload

1. Admin chọn file; client kiểm tra extension, size và tính SHA-256.
2. API xác thực admin/quyền album và cấp presigned PUT cho object key ngẫu nhiên.
3. Browser tải thẳng lên R2 với concurrency 3–5; multipart được dùng cho file lớn.
4. Client gọi finalize. Worker `HEAD` object, magic-byte sniff MIME, đối chiếu size/checksum, đọc dimensions/EXIF và tạo metadata.
5. `photos.status` chuyển `processing` rồi `ready`. Original không bị sửa.

## Delivery

API trả metadata và URL CDN theo width/quality/format. Grid dùng 300–500 px, album 800–1200 px, lightbox 1600–2400 px. AVIF/WebP được chọn theo `Accept`. Original chỉ được cấp GET signed URL sau authorization.

## Private gallery

Visitor gửi PIN qua TLS. Server so khớp hash có pepper, rate-limit theo IP + wedding, rồi phát token session opaque trong cookie HttpOnly. Token hash được lưu ở `guest_sessions`; mọi API private kiểm tra session/expiry. Trang private đặt `noindex, nofollow`.

## Download

Một ảnh: API authorize rồi redirect tới signed R2 URL. Nhiều ảnh/album: tạo `download_jobs`; queue worker stream object vào ZIP, tải archive lên R2 và cập nhật progress. Archive có TTL, link GET ngắn hạn và lifecycle tự xóa.

## Mở rộng AI

Processing events có thể fan-out tới worker feature extraction sau khi người dùng opt-in. Embedding/face vectors dùng bảng tách biệt, encryption và retention riêng; không có facial recognition trong MVP.
