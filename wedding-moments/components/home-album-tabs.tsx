"use client";
import { useState } from "react";
import { Download } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PhotoViewer } from "@/components/photo-viewer";
import { useLibrary } from "@/lib/use-library";
import { downloadOriginal } from "@/lib/save-photo";
import { getPhotoPreviewUrl, getPhotoThumbnailUrl, isPhotoReady } from "@/lib/photo-urls";

export function HomeAlbumTabs() {
  const { data, error, ready } = useLibrary();
  const [tab, setTab] = useState("");
  const [active, setActive] = useState<number | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const selected = data.albums.some(a => a.slug === tab) ? tab : data.albums.find(a => data.photos.some(p => p.album === a.slug && isPhotoReady(p)))?.slug ?? data.albums[0]?.slug ?? "";
  const currentPhotos = data.photos.filter(p => isPhotoReady(p) && p.album === selected);
  return <section id="albums" className="home-albums">
    <div className="home-albums-heading"><p>Thư viện ảnh</p><h1>{data.settings.title}</h1></div>
    {error && <p role="status">{ready ? "Kết nối gián đoạn. Ảnh mới sẽ tự cập nhật khi kết nối trở lại." : error}</p>}
    {!ready && !error && <p>Đang tải thư viện…</p>}
    <Tabs value={selected} onValueChange={value => { setTab(value); setActive(null); }} className="album-tabs">
      <TabsList variant="line" className="album-tabs-list" aria-label="Chọn album">
        {data.albums.map(album => <TabsTrigger key={album.slug} value={album.slug}>{album.name}<small>{data.photos.filter(p => p.album === album.slug).length}</small></TabsTrigger>)}
      </TabsList>
      {data.albums.map(album => <TabsContent value={album.slug} key={album.slug} className="home-tab-content">
        <div className="tab-album-meta"><span>{album.time}</span><p>{data.photos.filter(p => p.album === album.slug).length} ảnh</p></div>
        <div className="home-photo-grid">
          {data.photos.filter(p => isPhotoReady(p) && p.album === album.slug).map((photo, index) => <article className="home-photo-card" key={photo.id}>
            <button className="home-photo-open" onPointerEnter={() => { const image = new Image(); image.src = getPhotoPreviewUrl(photo); }} onFocus={() => { const image = new Image(); image.src = getPhotoPreviewUrl(photo); }} onClick={() => setActive(index)} aria-label={`Phóng to ${photo.alt}`}><img src={getPhotoThumbnailUrl(photo)} alt={photo.alt} width={photo.width} height={photo.height} loading={index < 12 ? "eager" : "lazy"} decoding="async" fetchPriority={index < 4 ? "high" : "auto"} /></button>
            <button className="home-photo-download" disabled={downloading !== null} aria-busy={downloading === photo.id} onClick={async () => { setDownloading(photo.id); try { await downloadOriginal(photo); } catch (e) { if ((e as Error).name !== "AbortError") alert("Chưa thể tải ảnh. Vui lòng thử lại."); } finally { setDownloading(null); } }} aria-label={downloading === photo.id ? "Đang tải ảnh gốc" : `Tải về ${photo.alt}`}><Download size={17} /><span>{downloading === photo.id ? "Đang tải…" : "Tải về"}</span></button>
          </article>)}
        </div>
        {!data.photos.some(p => p.album === album.slug) && <p className="admin-empty">Album chưa có ảnh.</p>}
      </TabsContent>)}
    </Tabs>
    <PhotoViewer photos={currentPhotos} index={active} onIndex={setActive} />
  </section>;
}
