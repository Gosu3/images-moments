# Thiết lập Supabase + Cloudflare R2 + Cloudflare Images

## Mô hình đang triển khai

| Dịch vụ | Nội dung lưu | Quyền truy cập |
| --- | --- | --- |
| Supabase | Album, thông tin ảnh, SHA-256, cài đặt | Chỉ server; phân tách theo người đăng nhập |
| R2 | File ảnh gốc, không nén lại, giữ EXIF | Bucket private; server đọc/ghi bằng chữ ký S3 |
| Cloudflare Images | Bản JPEG xem trước, cạnh dài tối đa 2400 px | Upload yêu cầu signed URL; thumbnail có link hết hạn |

Đăng nhập vẫn dùng ChatGPT/Sites như hiện tại, **chưa chuyển sang Supabase Auth**.
Khách chưa đăng nhập vẫn chỉ xem dữ liệu mẫu. Chia sẻ album thật cho khách bằng
PIN/public link là luồng riêng, chưa có trong bản tích hợp này.

Chưa có tài khoản/secret nên chưa xác nhận kết nối với các dịch vụ thật.
Các dịch vụ có thể yêu cầu phương thức thanh toán. Kiểm tra giá và hạn mức trong
dashboard trước khi kích hoạt; không cần mua tên miền để thiết lập bước này.

## 1. Tạo Supabase

1. Vào [Supabase Dashboard](https://supabase.com/dashboard), đăng ký/đăng nhập.
2. Tạo organization nếu được yêu cầu, sau đó chọn **New project**.
3. Đặt tên `wedding-moments`, chọn vùng gần người sử dụng, đặt mật khẩu database
   riêng và lưu vào trình quản lý mật khẩu. Chờ project hoạt động.
4. Mở **SQL Editor**, tạo query và chạy nội dung file
   `supabase/migrations/202609290001_library_storage.sql` trong dự án.
   Chỉ file này cần cho luồng thư viện hiện tại. Không cần chạy schema prototype
   `202609280001_initial_schema.sql`. Không thay thế/xóa bảng hiện có.
5. Kiểm tra có bảng `public.wm_libraries` và hàm `public.wm_save_library`.
   Bảng bật RLS, không cấp quyền cho `anon` hoặc `authenticated`; chỉ server dùng
   secret key. Giữ Data API bật cho schema `public`.
6. Trong phần kết nối/thiết lập API lấy **Project URL** vào `SUPABASE_URL`.
   Trong **Settings → API Keys**, lấy/tạo **secret key** (`sb_secret_...`) vào
   `SUPABASE_SECRET_KEY`. Không dùng publishable/anon key thay cho secret này.
   Nếu project chỉ có key cũ, dùng `SUPABASE_SERVICE_ROLE_KEY` thay thế.

Tài liệu: [API keys](https://supabase.com/docs/guides/getting-started/api-keys),
[SQL Editor và database](https://supabase.com/docs/guides/database/overview).

## 2. Tạo bucket Cloudflare R2

1. Vào [Cloudflare Dashboard](https://dash.cloudflare.com), tạo tài khoản hoặc đăng nhập.
2. Mở **R2 Object Storage**, làm bước kích hoạt nếu dashboard yêu cầu.
3. Tạo bucket tên `wedding-originals` (hoặc tên khác, ghi đúng vào cấu hình).
4. Giữ bucket **private**: không bật public development URL, không nối public domain.
5. Ở trang R2, mở quản lý API token. Tạo token với quyền **Object Read & Write**,
   giới hạn **chỉ bucket wedding-originals**, không dùng quyền toàn tài khoản.
6. Lưu **Access Key ID**, **Secret Access Key**, **Account ID** tương ứng vào
   `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ACCOUNT_ID`.
   Account ID là phần 32 ký tự trong endpoint `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`.
7. Đặt `R2_BUCKET_NAME=wedding-originals`.

Bản hiện tại truyền file qua API của ứng dụng rồi tới R2, không tải trực tiếp từ
trình duyệt tới S3, vì vậy không cần mở CORS bucket. API presign prototype cũ đã
được tắt để không cấp quyền ghi khi chưa có bước xác thực/finalize đầy đủ.

Tài liệu: [R2 S3 setup](https://developers.cloudflare.com/r2/get-started/s3/).

## 3. Bật Cloudflare Images

1. Trong Cloudflare, mở **Images / Hosted Images**, kích hoạt khi bạn đồng ý
   điều khoản/chi phí hiển thị. Có thể dùng cùng Account ID với R2.
2. Tạo API token riêng, quyền **Account → Cloudflare Images → Edit**, chỉ cho
   tài khoản đang dùng. Lưu vào `CF_IMAGES_API_TOKEN`.
3. Lấy **Account Hash** của Images vào `CF_IMAGE_ACCOUNT_HASH` (khác Account ID).
4. Trong Images → **Keys**, lấy/tạo **signing key** vào `CF_IMAGE_SIGNING_KEY`.
   Signing key khác API token ở bước 2.
5. Tạo variant tên **thumbnail**, kích thước 600 × 600, fit `cover`, metadata `none`.
   **Không bật Always allow public access**: `neverRequireSignedURLs` phải là `false`.
6. Đặt `CF_IMAGES_THUMBNAIL_VARIANT=thumbnail`, `CF_IMAGES_ENABLED=true`.

Images nhận bản JPEG đã thu nhỏ; ảnh gốc tối đa 50 MB vẫn chỉ lưu nguyên vẹn ở R2.
Nếu Images thất bại, ảnh gốc vẫn được giữ, UI báo cảnh báo và có nút thử lại.
Một số định dạng ảnh động/độ phân giải đặc biệt có thể không tạo được preview.

Tài liệu: [Variants](https://developers.cloudflare.com/images/optimization/hosted-images/create-variants/),
[Ảnh riêng tư](https://developers.cloudflare.com/images/optimization/hosted-images/serve-private-images/),
[Giới hạn upload](https://developers.cloudflare.com/api/resources/images/subresources/v1/methods/create/).

## 4. Điền cấu hình an toàn

Mẫu tên biến nằm ở `docs/storage.env.example` (không có secret thật).

- Local dev: tạo file `.dev.vars` ở thư mục `wedding-moments`, điền các biến theo
  mẫu và khởi động lại `npm run dev`. File này được Git bỏ qua.
- Production: điền cùng các biến ở **server runtime secrets** của host. Không đặt
  chúng vào mã nguồn, biến `NEXT_PUBLIC_*`, form trên website hay tin nhắn chat.
- Không đặt secret vào `vite.config.ts`/`define` hoặc `.openai/hosting.json`.
- Cấu hình hosting Sites hiện đang không truy cập được (`NOT_FOUND`); phải khôi
  phục quyền truy cập Site trước khi cấu hình secret và xuất bản online.
- Không đưa bản preview local ra internet: các header nhận dạng tại local chỉ
  dành cho kiểm thử, production phải đi qua bộ xác thực của nền tảng Sites.

Chỉ đặt `LIBRARY_DATABASE=supabase` và `ORIGINAL_STORAGE=s3` khi đã tạo xong
dịch vụ, chạy SQL và điền đủ secret. Không tự fallback sang D1 khi Supabase lỗi,
để tránh lưu dữ liệu thành hai bản khác nhau.

**Dữ liệu cũ:** mặc định vẫn là D1 + R2 binding hiện tại. Đổi sang Supabase mở
nguồn dữ liệu mới, không tự sao chép D1. Nếu đã tải ảnh thật hoặc sửa album trước
đó, giữ cấu hình cũ và thực hiện sao lưu/migration riêng trước khi đổi nguồn.
Dữ liệu cũ không bị xóa. Metadata mới ghi rõ ảnh ở R2 binding hay R2 riêng;
không bỏ binding cũ khi vẫn cần đọc ảnh cũ.

## 5. Kiểm tra trước khi sử dụng thật

1. Đăng nhập, mở **Quản trị → Cài đặt → Kiểm tra cấu hình**. Danh sách phải báo
   Supabase, R2 riêng, Images đã bật và không thiếu biến. Đây chỉ là kiểm tra sự
   hiện diện của cấu hình, chưa phải xác nhận dịch vụ kết nối thành công.
2. Tạo một album thử, tải ảnh JPEG/PNG/WebP nhỏ. Chờ báo **Đã lưu ảnh gốc**.
3. Kiểm tra `wm_libraries` có metadata, R2 có file gốc, Images có bản preview.
4. Tải lại trang: album và ảnh vẫn tồn tại. Thử cùng ảnh lớn hơn 10 MB để kiểm
   tra việc tách ảnh gốc/preview (giới hạn bản này: 50 MB/ảnh).
5. Bấm **Tải về**, đối chiếu file gốc và file vừa tải bằng PowerShell:

   ```powershell
   Get-FileHash -Algorithm SHA256 -LiteralPath 'C:\duong-dan\anh-goc.jpg'
   Get-FileHash -Algorithm SHA256 -LiteralPath 'C:\duong-dan\anh-tai-ve.jpg'
   ```

   Hai giá trị hash phải trùng. Kích thước và EXIF ảnh gốc không bị chỉnh sửa.
6. Kiểm tra một tài khoản khác không đọc được đường dẫn ảnh riêng của bạn.
7. Thử làm sai Images token trên môi trường thử: upload phải báo ảnh gốc đã lưu,
   preview lỗi; sửa lại token, nhấn **Thử lại**, không tạo ảnh trùng trong thư viện.

## Giới hạn hiện tại / việc cần làm trước khi mở rộng

- Album/cài đặt/photo metadata hiện nằm trong JSONB một hàng mỗi chủ thư viện,
  có revision chống ghi đè. Chưa nối UI vào các bảng prototype weddings/photos.
- Không có multipart/resume; hàng đợi tuần tự, thử lại sau mất kết nối được hỗ trợ
  trong phiên hiện tại bằng uploadId. Tải lại toàn bộ trang sẽ mất hàng đợi local.
- File đi qua ứng dụng, tối đa 50 MB; chưa phù hợp video hoặc file RAW/HEIC.
- Server kiểm tra loại file/header, kích thước, SHA-256; chưa quét malware hay
  trích EXIF ở server. Dimensions là dữ liệu client cung cấp, không dùng để cấp quyền.
- Xóa ảnh khỏi thư viện chưa xóa vật lý ảnh gốc/Images. File mồ côi sau lỗi
  database/timeout được giữ để đối soát; chưa có job dọn tự động. Điều này có thể
  phát sinh lưu trữ, cần theo dõi trước khi tải số lượng lớn.
- Chưa có Supabase Auth, link khách/PIN, ZIP album hay kết nối dịch vụ thật được
  xác nhận. Không xem bản scaffold kiến trúc ban đầu là danh sách tính năng đã có.
