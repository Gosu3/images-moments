# Image pipeline R2 v2

## Phạm vi

Không đổi framework, authentication, layout hay thao tác zoom/swipe. Metadata vẫn trong library JSON hiện tại (Supabase hoặc D1), dùng revision/CAS. Không chạy lại schema DB chỉ vì thay đổi này.

`IMAGE_PIPELINE=legacy` giữ upload cũ. `r2-v2` bật presigned PUT mới. Ảnh đã chuyển sang v2 vẫn được phục vụ theo v2 kể cả khi tắt flag; không xóa Worker/secret khi rollback upload. Ảnh legacy chưa migrate vẫn dùng source cũ, có thể là original trong viewer. Vì vậy chưa được coi là hoàn tất chuyển đổi trước khi kiểm tra migration.

## Chính sách cố định

| Loại | Lưu trữ / xử lý |
| --- | --- |
| Original | Private `wedding-originals`, giữ nguyên bytes và SHA-256 |
| Preview | Private `wedding-previews`, JPEG 85, scale-down tối đa 2400px |
| Thumbnail | Images binding: 600×600 cover, quality 85, chọn AVIF/WebP/JPEG theo Accept; không có file thumbnail trong R2 |
| Upload | PUT staging 15 phút, finalize kiểm tra bytes rồi đóng băng original |
| Download | POST có xác thực cấp signed GET 5 phút, tên file gốc |

Final key: `albums/{hash-owner-album}/{photoId}.{ext}`; preview cùng id `.jpg`. Staging `uploads/…` ngăn URL PUT còn hiệu lực ghi đè original đã xác minh. Chấp nhận JPEG/PNG/WebP tối đa 50MB, 100 megapixels. Không lưu signed URL vào metadata.

Gallery dùng `getPhotoThumbnailUrl`, viewer dùng `getPhotoPreviewUrl`. Chỉ ảnh `ready` xuất hiện. Job lỗi giữ original và trạng thái để thử lại; lease xử lý 5 phút tránh hai finalize chạy đồng thời. EXIF rotation/metadata của Images cần xác nhận bằng ảnh thật trước rollout.

## Tạo và cấu hình dịch vụ

1. Tạo Supabase theo `SETUP-STORAGE-VI.md`, giữ cơ chế đăng nhập hiện tại. Secret chỉ nằm phía server.
2. Trong Cloudflare tạo hai R2 bucket `wedding-originals`, `wedding-previews`. Không bật r2.dev/public domain cho cả hai.
3. Tạo R2 access key giới hạn đúng bucket original, quyền đọc/ghi. Điền `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ORIGINALS_BUCKET` phía application server. Endpoint được suy ra từ account ID, không cần biến endpoint riêng.
4. Áp dụng CORS mẫu `workers/images/r2-cors.example.json` cho original. Thay domain mẫu bằng domain ứng dụng chính xác. GET cần cho download blob, PUT cho upload. Không dùng wildcard. Bỏ localhost trong production nếu không cần.
5. Bật dịch vụ Images cho tài khoản Cloudflare. File `workers/images/wrangler.jsonc` khai báo binding `IMAGES`, `ORIGINALS`, `PREVIEWS`; tên bucket thực tế phải khớp file này. Biến `R2_PREVIEWS_BUCKET` là tham chiếu cấu hình, không tự thay binding đã deploy.
6. Tạo secret ngẫu nhiên ít nhất 32 ký tự, đặt cùng giá trị `IMAGE_WORKER_SECRET` ở app và Worker bằng secret manager. Không gửi secret vào chat/git. Worker dùng HMAC bảo vệ process/delete/media, không cung cấp endpoint đọc original.
7. Sau khi đăng nhập đúng tài khoản Cloudflare, deploy riêng Worker bằng `npx wrangler deploy --config workers/images/wrangler.jsonc`; đặt secret bằng `npx wrangler secret put IMAGE_WORKER_SECRET --config workers/images/wrangler.jsonc`. Chỉ thực hiện khi đã sẵn sàng tạo tài nguyên trên tài khoản của bạn.
8. Đặt `IMAGE_DELIVERY_DOMAIN` thành HTTPS origin của Worker, không kèm path. Giữ flag legacy tới khi hoàn tất smoke test staging, sau đó bật `IMAGE_PIPELINE=r2-v2` và deploy app theo host hiện tại.

Không trỏ custom domain public vào original. Worker đọc R2 qua binding; browser nhận media URL ký ngắn hạn. Edge cache khóa theo key/ETag/variant/format, không theo chữ ký thay đổi; cache edge dài, cache browser private tối đa thời gian chữ ký. Kiểm tra quyền trước cache và kiểm tra object còn tồn tại để không tiếp tục phục vụ ảnh đã dọn. Chi phí thực tế gồm tạo preview và các lần transform/cache miss; không cam kết một lần tính phí cho mỗi ảnh.

## Xóa và cleanup

Xóa ảnh tạo tombstone và ẩn ngay. Sau khi signed upload/processing hết hạn cộng 5 phút an toàn, nút “Dọn file của ảnh đã xóa” gọi cleanup (tối đa 20 job/lần), xóa original + preview + staging trước khi bỏ metadata. Lỗi giữ tombstone để thử lại. Chạy lại đến khi pending bằng 0.

Đây là cleanup theo yêu cầu, **chưa có lịch nền tự động**. Người vận hành phải chạy định kỳ endpoint owner-scoped hoặc script `node scripts/migrate-images.mjs --cleanup` bằng session hợp lệ. Cấu hình lifecycle R2 xóa **chỉ prefix `uploads/` sau 1 ngày** để dọn staging bỏ dở; tuyệt đối không áp dụng lifecycle này cho `albums/`. Job pending bỏ dở vẫn có thể xóa từ tab upload. Không đảm bảo tự dọn toàn bộ orphan nếu chưa cấu hình vận hành này.

Legacy originals/storage cũ được giữ lại, kể cả sau soft-delete hoặc migration, cho tới khi có phê duyệt cleanup riêng. Tombstone có legacySource giữ thông tin khôi phục; không tự xóa dữ liệu cũ.

## Migration an toàn

Inventory local trước thay đổi: 10 libraries, 11.371 bản ghi, trong đó 11.370 ảnh demo và 1 original thử nghiệm. Đây **không phải** thống kê production. API inventory chỉ thấy library của người đang đăng nhập.

Thiết lập `MIGRATION_APP_URL` và `MIGRATION_COOKIE` từ phiên đăng nhập hợp lệ trong môi trường terminal riêng (không commit). Chỉ localhost có thể dùng `MIGRATION_LOCAL_USER` để kiểm thử local; không có bypass đăng nhập remote.

```sh
node scripts/migrate-images.mjs          # dry-run, không sửa metadata/storage
node scripts/migrate-images.mjs --apply  # copy, generate, verify hash, đổi keys
```

Script bỏ qua demo, resume theo log `work/image-migration.jsonl`, retry lỗi tạm thời; conflict/lease cần đợi 5 phút rồi chạy lại. Migration phải đọc/copy original cũ qua server vì đây là chuyển dữ liệu tồn tại, không phải upload khách mới. Không xóa storage cũ. Kiểm tra mỗi original tải xuống có SHA-256 đúng, preview/thumbnail/viewer hoạt động rồi mới xin cleanup storage cũ. Chạy theo từng owner, không suy diễn một lần chạy là toàn bộ tài khoản.

## Xác minh và giới hạn

Unit tests dùng R2/Images giả lập, không chứng minh Cloudflare đã cấu hình thành công. Trước rollout phải kiểm tra tài khoản thật: upload một/nhiều ảnh, ảnh EXIF xoay, JPEG/PNG/WebP, ảnh nhỏ không upscale, preview kích thước/chất lượng, thumbnail 600, next/previous, tải original so hash/tên, signed URL hết hạn, xóa và cleanup, refresh, mobile/mạng chậm và memory.

Chưa có tài khoản Supabase/Cloudflare cấu hình cho lần thay đổi này: các mục end-to-end trên dịch vụ thật là **NOT TESTED**, chưa đạt nghiệm thu production. Không migration production hoặc xóa storage cũ.

### Kết quả local 29/09/2026

| Kiểm tra | Kết quả |
| --- | --- |
| Typecheck | PASS |
| Lint | PASS, 0 lỗi / 8 cảnh báo img |
| Unit tests | PASS, 16/16 (dịch vụ cloud giả lập) |
| Build ứng dụng / bundle Worker dry-run | PASS |
| API legacy local: upload, hash original, isolation, xóa, lưu metadata | PASS (`scripts/check-library.mjs`) |
| Upload 1 ảnh R2 v2 qua UI | NOT TESTED — thiếu cloud setup |
| Upload nhiều ảnh R2 v2 | NOT TESTED — thiếu cloud setup |
| Gallery render dữ liệu demo | PASS |
| Thumbnail 600 thực tế trên CDN | NOT TESTED — unit test fixed transform PASS |
| Lightbox dữ liệu demo | PASS; preview v2 cloud NOT TESTED |
| Next/previous | PASS bằng Enter; click tự động FAIL (không đổi chỉ số), chưa xác định nguyên nhân |
| Download original v2 trên browser | NOT TESTED — legacy API giữ đúng bytes PASS |
| Delete + physical cleanup v2 trên cloud | NOT TESTED — Worker mock PASS |
| Refresh trang local | PASS |
| Mobile viewport 390px, gallery/lightbox | PASS hiển thị; pinch thiết bị thật NOT TESTED |
| Mạng mobile chậm / memory benchmark | NOT TESTED |

Không xem kiểm thử demo/legacy là nghiệm thu R2 v2. Cần xác minh thêm thao tác click next/previous trên trình duyệt thực trước release.
