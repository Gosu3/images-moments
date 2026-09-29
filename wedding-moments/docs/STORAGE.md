# Storage

## Original

Original được ghi đúng byte đã upload, không resize, recompress hay overwrite. Database chỉ giữ metadata. Object key:

```text
weddings/{weddingId}/albums/{albumId}/originals/{photoId}.{ext}
archives/{weddingId}/{downloadJobId}.zip
```

Tên file người dùng chỉ nằm trong `original_filename`. Replacement luôn có `photoId`/object key mới để không phá cache.

## CDN variants

- thumbnail: width 320/480, quality 68–76, AVIF/WebP
- grid: width 800/1200, quality 78–84
- fullscreen: width 1600/2400, quality 82–88
- download: original private object

Variant URL là immutable theo object key. Preview cache `public, max-age=31536000, immutable`; metadata/API private cache ngắn hoặc `private, no-store` tùy dữ liệu.

## Deletion

UI yêu cầu xác nhận. MVP soft-delete bằng `deleted_at`, ẩn khỏi API và đưa object vào retention 30 ngày. Job định kỳ mới xóa object/variant/archive. Audit log ghi actor, object và thời gian; không log URL ký hay secret.

## Backup

R2 versioning/lifecycle + replication/export định kỳ sang provider thứ hai hoặc NAS. Một bản offline, mã hóa và kiểm thử checksum. Restore drill theo quý; database có PITR/daily dump độc lập với object backup.
