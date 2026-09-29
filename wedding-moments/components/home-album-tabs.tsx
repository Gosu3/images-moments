"use client";
import Link from "next/link";
import {useState} from "react";
import {Download, Images} from "lucide-react";
import {Tabs,TabsContent,TabsList,TabsTrigger} from "@/components/ui/tabs";
import {albums,photos} from "@/lib/mock-data";
import {savePhotoToDevice} from "@/lib/save-photo";

export function HomeAlbumTabs(){
  const[notice,setNotice]=useState("");
  const download=async(id:string)=>{try{const result=await savePhotoToDevice(`/api/photos/${id}/download`,`wedding-moment-${id}.jpg`);setNotice(result==="shared"?"Đã mở menu lưu ảnh của điện thoại.":"Ảnh đã được tải về.")}catch(error){if((error as Error).name!=="AbortError")setNotice("Chưa thể tải ảnh. Vui lòng thử lại.")}};
  return <section id="albums" className="home-albums">
    <div className="home-albums-heading"><div><p className="eyebrow ink">Thư viện ảnh</p><h2>Chọn một album để xem</h2></div><Link href="/album/le-thanh-hon"><Images size={18}/>Xem toàn bộ thư viện</Link></div>
    <Tabs defaultValue={albums[0].slug} className="album-tabs">
      <TabsList variant="line" className="album-tabs-list" aria-label="Chọn album">
        {albums.map(album=><TabsTrigger key={album.slug} value={album.slug}>{album.name}<small>{album.count}</small></TabsTrigger>)}
      </TabsList>
      {albums.map((album,albumIndex)=><TabsContent value={album.slug} key={album.slug} className="home-tab-content">
        <div className="tab-album-meta"><span>{album.time}</span><p>{album.count} khoảnh khắc</p></div>
        <div className="home-photo-grid">
          {photos.slice(albumIndex,albumIndex+6).map((photo,index)=><article className="home-photo-card" key={`${album.slug}-${photo.id}`} style={{aspectRatio:`${photo.width}/${photo.height}`}}>
            <Link href={`/album/${album.slug}`} aria-label={`Mở ${photo.alt}`}><img src={photo.preview} alt={photo.alt} loading={albumIndex===0&&index<3?"eager":"lazy"}/></Link>
            <button onClick={()=>download(photo.id)} aria-label={`Tải về ${photo.alt}`}><Download size={17}/><span>Tải về</span></button>
          </article>)}
        </div>
        <Link className="open-album-link" href={`/album/${album.slug}`}>Mở album {album.name}</Link>
      </TabsContent>)}
    </Tabs>
    <p className="download-notice" role="status" aria-live="polite">{notice}</p>
  </section>
}
