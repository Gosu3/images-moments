# Architecture

> Tài liệu dưới đây là kiến trúc mục tiêu ban đầu, không phải toàn bộ chức năng
> đã triển khai. Trạng thái tích hợp hiện tại, giới hạn và cách cấu hình thực tế:
> [SETUP-STORAGE-VI.md](./SETUP-STORAGE-VI.md).

## Quyết định

Next.js chịu trách nhiệm UI, authorization, metadata và business logic. Supabase là nguồn dữ liệu thư viện. R2 giữ nguyên byte gốc và hai biến thể WebP cố định. Trình duyệt upload thẳng original bằng presigned PUT; file lớn không đi qua request body của Vercel.

## Luồng hệ thống

```text
Browser ──metadata/actions──> Next.js ──JSONB──> Supabase
   │                            │
   ├──xin presigned PUT────────>│
   └──original bytes trực tiếp──> R2 <──thumbnail/preview do Vercel tạo một lần
```

## Upload

1. Admin chọn file; client kiểm tra extension, size và tính SHA-256.
2. API xác thực admin/quyền album và cấp presigned PUT cho object key ngẫu nhiên.
3. Browser tải thẳng lên R2 với concurrency 4 và giữ nguyên file.
4. Client gọi finalize. Vercel `HEAD` object, kiểm tra MIME, dung lượng, magic bytes, SHA-256 và tạo WebP 640 px/2400 px một lần.
5. `photos.status` chuyển `processing` rồi `ready`. Original không bị sửa.

## Delivery

Grid dùng thumbnail WebP 640 px; lightbox dùng preview WebP tối đa 2400 px. Cả hai được cache trong R2 và trình duyệt. Original chỉ được cấp GET signed URL sau authorization và không bị chuyển mã.

## Private gallery

Visitor gửi PIN qua TLS. Server so khớp hash có pepper, rate-limit theo IP + wedding, rồi phát token session opaque trong cookie HttpOnly. Token hash được lưu ở `guest_sessions`; mọi API private kiểm tra session/expiry. Trang private đặt `noindex, nofollow`.

## Download

Một ảnh: API authorize rồi redirect tới signed R2 URL. Nhiều ảnh/album: tạo `download_jobs`; queue worker stream object vào ZIP, tải archive lên R2 và cập nhật progress. Archive có TTL, link GET ngắn hạn và lifecycle tự xóa.

## Mở rộng AI

Processing events có thể fan-out tới worker feature extraction sau khi người dùng opt-in. Embedding/face vectors dùng bảng tách biệt, encryption và retention riêng; không có facial recognition trong MVP.
