"use client";
import { useState } from "react";
import { Download } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PhotoViewer } from "@/components/photo-viewer";
import { useLibrary } from "@/lib/use-library";
import { savePhotoToDevice } from "@/lib/save-photo";

export function HomeAlbumTabs() {
  const { data } = useLibrary();
  const [tab, setTab] = useState("pre-wedding");
  const [active, setActive] = useState<number | null>(null);
  const selected = data.albums.some(a => a.slug === tab) ? tab : data.albums[0]?.slug ?? "";
  const currentPhotos = data.photos.filter(p => p.album === selected);
  return <section id="albums" className="home-albums">
    <div className="home-albums-heading"><p className="eyebrow ink">Thư viện ảnh</p><h2>{data.settings.title}</h2></div>
    <Tabs value={selected} onValueChange={value => { setTab(value); setActive(null); }} className="album-tabs">
      <TabsList variant="line" className="album-tabs-list" aria-label="Chọn album">
        {data.albums.map(album => <TabsTrigger key={album.slug} value={album.slug}>{album.name}<small>{data.photos.filter(p => p.album === album.slug).length}</small></TabsTrigger>)}
      </TabsList>
      {data.albums.map(album => <TabsContent value={album.slug} key={album.slug} className="home-tab-content">
        <div className="tab-album-meta"><span>{album.time}</span><p>{data.photos.filter(p => p.album === album.slug).length} ảnh</p></div>
        <div className="home-photo-grid">
          {data.photos.filter(p => p.album === album.slug).map((photo, index) => <article className="home-photo-card" key={photo.id}>
            <button className="home-photo-open" onClick={() => setActive(index)} aria-label={`Phóng to ${photo.alt}`}><img src={photo.preview} alt={photo.alt} width={photo.width} height={photo.height} loading={index < 8 ? "eager" : "lazy"} decoding="async" /></button>
            <button className="home-photo-download" onClick={async () => { try { await savePhotoToDevice(photo.src, photo.filename); } catch (e) { if ((e as Error).name !== "AbortError") alert("Chưa thể tải ảnh. Vui lòng thử lại."); } }} aria-label={`Tải về ${photo.alt}`}><Download size={17} /><span>Tải về</span></button>
          </article>)}
        </div>
        {!data.photos.some(p => p.album === album.slug) && <p className="admin-empty">Album chưa có ảnh.</p>}
      </TabsContent>)}
    </Tabs>
    <PhotoViewer photos={currentPhotos} index={active} onIndex={setActive} />
  </section>;
}
