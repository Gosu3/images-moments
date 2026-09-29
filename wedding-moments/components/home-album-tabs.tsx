"use client";
import {useState} from "react";
import {Download} from "lucide-react";
import {Tabs,TabsContent,TabsList,TabsTrigger} from "@/components/ui/tabs";
import {Dialog,DialogContent,DialogDescription,DialogTitle} from "@/components/ui/dialog";
import {albums,photos,type Photo} from "@/lib/mock-data";
import {savePhotoToDevice} from "@/lib/save-photo";

export function HomeAlbumTabs(){
  const[active,setActive]=useState<{photo:Photo;alt:string}|null>(null);
  const download=async(id:string)=>{try{await savePhotoToDevice(`/api/photos/${id}/download`,`wedding-moment-${id}.jpg`)}catch(error){if((error as Error).name!=="AbortError")window.alert("Chưa thể tải ảnh. Vui lòng thử lại.")}};
  return <section id="albums" className="home-albums">
    <div className="home-albums-heading"><div><p className="eyebrow ink">Thư viện ảnh</p><h2>Khoảnh khắc của chúng mình</h2></div></div>
    <Tabs defaultValue={albums[0].slug} className="album-tabs">
      <TabsList variant="line" className="album-tabs-list" aria-label="Chọn album">
        {albums.map(album=><TabsTrigger key={album.slug} value={album.slug}>{album.name}<small>{album.count}</small></TabsTrigger>)}
      </TabsList>
      {albums.map((album,albumIndex)=>{const gallery=Array.from({length:album.count},(_,index)=>photos[(albumIndex*5+index)%photos.length]);return <TabsContent value={album.slug} key={album.slug} className="home-tab-content">
        <div className="tab-album-meta"><span>{album.time}</span><p>{album.count} ảnh</p></div>
        <div className="home-photo-grid">
          {gallery.map((photo,index)=><article className="home-photo-card" key={`${album.slug}-${index}`}>
            <button className="home-photo-open" onClick={()=>setActive({photo,alt:`${album.name} — ảnh ${index+1}`})} aria-label={`Phóng to ${album.name} — ảnh ${index+1}`}><img src={photo.preview} alt={`${album.name} — ảnh ${index+1}`} loading={albumIndex===0&&index<8?"eager":"lazy"}/></button>
            <button className="home-photo-download" onClick={()=>download(photo.id)} aria-label={`Tải về ${photo.alt}`}><Download size={17}/><span>Tải về</span></button>
          </article>)}
        </div>
      </TabsContent>})}
    </Tabs>
    <Dialog open={active!==null} onOpenChange={open=>{if(!open)setActive(null)}}>
      <DialogContent className="home-lightbox" showCloseButton>
        <DialogTitle className="sr-only">Xem ảnh toàn màn hình</DialogTitle>
        <DialogDescription className="sr-only">Ảnh được hiển thị đầy đủ theo đúng tỷ lệ gốc.</DialogDescription>
        {active&&<img src={active.photo.src} alt={active.alt}/>}
      </DialogContent>
    </Dialog>
  </section>
}
