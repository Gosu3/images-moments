"use client";
import Link from "next/link";
import { useLibrary } from "@/lib/use-library";
import { isPhotoReady } from "@/lib/photo-urls";
import { GalleryExperience } from "./gallery-experience";

export function LibraryAlbumGallery({ slug }: { slug: string }) {
  const { data, ready, error, authRequired, reload } = useLibrary();
  if (error) return <div className="admin-empty" role="alert">{error} {authRequired && <Link href="/admin/login">Đăng nhập</Link>}<button onClick={() => void reload()}>Thử lại</button></div>;
  if (!ready) return <p className="admin-empty">Đang tải thư viện…</p>;
  const album = data.albums.find(a => a.slug === slug);
  if (!album) return <p className="admin-empty">Album không tồn tại. <Link href="/">Về trang chủ</Link></p>;
  const photos = data.photos.filter(p => p.album === slug && isPhotoReady(p));
  return <><GalleryExperience photos={photos} albumName={album.name} />{!photos.length && <p className="admin-empty">Album chưa có ảnh.</p>}</>;
}
