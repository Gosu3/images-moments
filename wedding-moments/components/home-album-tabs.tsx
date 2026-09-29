"use client";
import {useState} from "react";
import {Download} from "lucide-react";
import {Tabs,TabsContent,TabsList,TabsTrigger} from "@/components/ui/tabs";
import {albums,photos} from "@/lib/mock-data";
import {savePhotoToDevice} from "@/lib/save-photo";

export function HomeAlbumTabs(){
  const[notice,setNotice]=useState("");
  const download=async(id:string)=>{try{const result=await savePhotoToDevice(`/api/photos/${id}/download`,`wedding-moment-${id}.jpg`);setNotice(result==="shared"?"Đã mở menu lưu ảnh của điện thoại.":"Ảnh đã được tải về.")}catch(error){if((error as Error).name!=="AbortError")setNotice("Chưa thể tải ảnh. Vui lòng thử lại.")}};
  return <section id="albums" className="home-albums">
    <div className="home-albums-heading"><div><p className="eyebrow ink">Thư viện ảnh</p><h2>Khoảnh khắc của chúng mình</h2></div><p>Chọn một tab để xem ảnh ngay tại đây.</p></div>
    <Tabs defaultValue={albums[0].slug} className="album-tabs">
      <TabsList variant="line" className="album-tabs-list" aria-label="Chọn album">
        {albums.map(album=><TabsTrigger key={album.slug} value={album.slug}>{album.name}<small>{album.count}</small></TabsTrigger>)}
      </TabsList>
      {albums.map((album,albumIndex)=>{const visibleCount=Math.min(album.count,100);const gallery=Array.from({length:visibleCount},(_,index)=>photos[(albumIndex*5+index)%photos.length]);return <TabsContent value={album.slug} key={album.slug} className="home-tab-content">
        <div className="tab-album-meta"><span>{album.time}</span><p>Hiển thị {visibleCount} / {album.count} ảnh</p></div>
        <div className="home-photo-grid">
          {gallery.map((photo,index)=><article className="home-photo-card" key={`${album.slug}-${index}`}>
            <img src={photo.preview} alt={`${album.name} — ảnh ${index+1}`} loading={albumIndex===0&&index<8?"eager":"lazy"}/>
            <button onClick={()=>download(photo.id)} aria-label={`Tải về ${photo.alt}`}><Download size={17}/><span>Tải về</span></button>
          </article>)}
        </div>
      </TabsContent>})}
    </Tabs>
    <p className="download-notice" role="status" aria-live="polite">{notice}</p>
  </section>
}
