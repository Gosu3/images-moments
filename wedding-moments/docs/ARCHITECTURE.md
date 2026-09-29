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
4. Client gọi finalize. Vercel `HEAD` object, kiểm tra MIME và dung lượng; SHA-256 được lưu từ client, chưa được xác minh lại ở server trong luồng r2-direct.
5. `photos.status` chuyển `processing` rồi `ready`. Original không bị sửa. `after()` tạo sẵn WebP 640 px/2400 px; nếu chưa có, API ảnh tạo lại khi được xem.

## Delivery

Grid dùng thumbnail WebP 640 px; lightbox dùng preview WebP tối đa 2400 px. Cả hai được cache trong R2 và trình duyệt. Original chỉ được cấp GET signed URL sau authorization và không bị chuyển mã.

## Guest gallery

Khách trên Vercel xem thư viện `vercel-admin` qua `/api/gallery` không cần đăng nhập. Chỉ ảnh ready được trả về, không trả R2 key, checksum hoặc thông tin xử lý nội bộ. Admin vẫn dùng `/api/library` và các API ghi với cookie xác thực. Trang đặt `noindex, nofollow`. Client kiểm tra ETag mỗi 3 giây khi tab hiện; server gộp lượt đọc Supabase trong 2 giây. Đây là polling gần realtime, không phải Supabase Realtime WebSocket.

## Download

Một ảnh: API kiểm tra trạng thái ready và cấp signed R2 URL. Desktop tải trực tiếp; mobile và ZIP có đường stream cùng origin nếu CORS GET của R2 chưa bật. ZIP tạo trong trình duyệt, tối đa 100 ảnh/200 MB mỗi gói.

## Mở rộng AI

Processing events có thể fan-out tới worker feature extraction sau khi người dùng opt-in. Embedding/face vectors dùng bảng tách biệt, encryption và retention riêng; không có facial recognition trong MVP.
