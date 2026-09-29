# Performance

Grid không dùng original vì payload lớn phá LCP, data usage và memory. CDN trả đúng kích thước hiển thị; ratio lấy từ metadata nên layout được giữ trước khi ảnh tải, tránh CLS.

## Gallery

- Trang đầu chỉ render 9 ảnh; mỗi lần nạp thêm tối đa 6 trong demo, production dùng cursor pagination 24–40.
- `loading=lazy`, async decode và placeholder blur/dominant color.
- Lightbox chỉ prefetch previous/next; không preload album.
- Ảnh 2.000 mục dùng windowed masonry/virtualization nếu DOM vượt khoảng 150–250 nodes.
- Query có index `(album_id, sort_order, id)` và cursor ổn định; không dùng offset sâu.

## Network

Hero là asset duy nhất ưu tiên cao. Grid dùng `sizes/srcset` qua CDN production, AVIF/WebP và cache immutable. Service worker/PWA chỉ cache app shell và thumbnail gần đây, không cache original.

## Targets

- LCP < 2.5 s p75 trên 4G
- CLS < 0.1; INP < 200 ms
- initial image payload < 1.5 MB production
- không quá 6 image requests đồng thời chủ động từ app
- albums 50/500/2000 giữ số DOM node theo page/window, không theo tổng ảnh

Theo dõi Web Vitals, CDN hit ratio, bytes/image, request count và heap trong Chrome throttling ở 390, 430, 768, 1024, 1440, 1920 px.
