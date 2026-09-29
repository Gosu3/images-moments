"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useLibrary } from "@/lib/use-library";
import { readFavorites } from "@/lib/favorites";
import { isPhotoReady } from "@/lib/photo-urls";
import { GalleryExperience } from "./gallery-experience";
export function FavoritesGallery() {
  const { data, ready, error } = useLibrary();
  const [ids, setIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    const update = () => setIds(readFavorites());
    update();
    window.addEventListener("storage", update);
    window.addEventListener("wm-favorites-changed", update);
    return () => { window.removeEventListener("storage", update); window.removeEventListener("wm-favorites-changed", update); };
  }, []);
  if (error && !ready) return <p role="alert">{error} <Link href="/">Về thư viện</Link></p>;
  if (!ready) return <p>Đang tải ảnh yêu thích…</p>;
  const photos = data.photos.filter(p => ids.has(p.id) && isPhotoReady(p));
  return <><GalleryExperience photos={photos} albumName="Ảnh yêu thích" />{!photos.length && <p className="admin-empty">Chưa có ảnh yêu thích. <Link href="/">Mở thư viện để chọn ảnh</Link></p>}</>;
}
