"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Download, Expand, Heart, ImageDown, Play, QrCode, Share2, X } from "lucide-react";
import type { Photo } from "@/lib/mock-data";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

export function GalleryExperience({ photos, albumName }: { photos: Photo[]; albumName: string }) {
  const [visible, setVisible] = useState(9);
  const [active, setActive] = useState<number | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(() => { if(typeof window==="undefined") return new Set(); const saved=window.localStorage.getItem("wm-favorites"); return saved?new Set(JSON.parse(saved) as string[]):new Set(); });
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const touchStart = useRef<{x:number;y:number}|null>(null);

  const saveFavorites = (next:Set<string>) => { setFavorites(next); window.localStorage.setItem("wm-favorites", JSON.stringify([...next])); };
  const toggleFavorite = (id:string) => { const next=new Set(favorites); if(next.has(id))next.delete(id);else next.add(id);saveFavorites(next); };
  const toggleSelected = (id:string) => { const next=new Set(selected); if(next.has(id))next.delete(id);else next.add(id);setSelected(next); };
  const move = useCallback((delta:number) => setActive(current => current === null ? null : (current + delta + photos.length) % photos.length), [photos.length]);

  useEffect(() => {
    const onKey=(e:KeyboardEvent)=>{ if(active===null)return; if(e.key==="ArrowRight")move(1); if(e.key==="ArrowLeft")move(-1); };
    window.addEventListener("keydown",onKey); return()=>window.removeEventListener("keydown",onKey);
  },[active,move]);

  const current = active === null ? null : photos[active];
  const selectionLabel = useMemo(()=>`${selected.size} ảnh đã chọn`,[selected.size]);
  const share = async () => {
    const url=current?`${location.origin}${location.pathname}?photo=${current.id}`:location.href;
    if(navigator.share) await navigator.share({title:albumName,text:"Cùng xem khoảnh khắc này nhé",url});
    else { await navigator.clipboard.writeText(url); alert("Đã sao chép liên kết"); }
  };

  return <>
    <header className="gallery-header">
      <Link href="/" className="round-control" aria-label="Về trang chủ"><ArrowLeft size={19}/></Link>
      <div><p>MINH ANH &amp; HOÀNG NAM</p><h1>{albumName}</h1></div>
      <div className="gallery-actions">
        <button onClick={()=>setSelectMode(v=>!v)} className={selectMode?"text-control active":"text-control"}>{selectMode?<><X size={17}/>Thoát</>:<><Check size={17}/>Chọn ảnh</>}</button>
        <button className="round-control" onClick={share} aria-label="Chia sẻ album"><Share2 size={18}/></button>
      </div>
    </header>
    <section className="gallery-intro">
      <p className="eyebrow ink">18.10.2026 · Hà Nội</p><p>{photos.length * 24 + 5} khoảnh khắc</p>
      <Link className="slideshow-btn" href="/qr/album/le-thanh-hon"><QrCode size={15}/> Mã QR</Link><button className="slideshow-btn" onClick={()=>setActive(0)}><Play size={15} fill="currentColor"/> Trình chiếu</button>
    </section>
    <section className="photo-grid" aria-label={`Ảnh trong ${albumName}`}>
      {photos.slice(0,visible).map((photo,index)=><button key={photo.id} className="photo-card" style={{aspectRatio:`${photo.width}/${photo.height}`}} onClick={()=>selectMode?toggleSelected(photo.id):setActive(index)} aria-label={`${selectMode?"Chọn":"Mở"} ${photo.alt}`}>
        <img src={photo.preview} alt={photo.alt} loading={index<4?"eager":"lazy"} decoding="async" />
        {selectMode&&<span className={selected.has(photo.id)?"select-dot selected":"select-dot"}>{selected.has(photo.id)&&<Check size={16}/>}</span>}
        {!selectMode&&<span className="photo-time">{photo.takenAt}</span>}
      </button>)}
    </section>
    {visible<photos.length&&<div className="load-more"><button onClick={()=>setVisible(v=>Math.min(v+6,photos.length))}>Xem thêm khoảnh khắc <span>{visible} / {photos.length}</span></button></div>}

    {selectMode&&<div className="selection-bar" role="status"><strong>{selectionLabel}</strong><button onClick={()=>setSelected(new Set(photos.slice(0,visible).map(p=>p.id)))}>Chọn ảnh đã tải</button><button onClick={()=>{const next=new Set(favorites);selected.forEach(id=>next.add(id));saveFavorites(next)}}><Heart size={17}/>Yêu thích</button><a href={`/api/download?ids=${[...selected].join(",")}`}><ImageDown size={17}/>Tải xuống</a><button onClick={()=>setSelected(new Set())}>Bỏ chọn</button></div>}

    <Dialog open={active!==null} onOpenChange={open=>!open&&setActive(null)}>
      <DialogContent className="lightbox" showCloseButton={false} onTouchStart={e=>touchStart.current={x:e.touches[0].clientX,y:e.touches[0].clientY}} onTouchEnd={e=>{if(!touchStart.current)return;const dx=e.changedTouches[0].clientX-touchStart.current.x;const dy=e.changedTouches[0].clientY-touchStart.current.y;if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy))move(dx<0?1:-1);if(dy>100&&Math.abs(dy)>Math.abs(dx))setActive(null);touchStart.current=null}}>
        <DialogTitle className="sr-only">Xem ảnh toàn màn hình</DialogTitle><DialogDescription className="sr-only">Vuốt hoặc dùng phím mũi tên để chuyển ảnh.</DialogDescription>
        {current&&<>
          <div className="lightbox-top"><span>{active!+1} / {photos.length}</span><div><button onClick={()=>toggleFavorite(current.id)} aria-label="Yêu thích"><Heart fill={favorites.has(current.id)?"currentColor":"none"}/></button><button onClick={share} aria-label="Chia sẻ"><Share2/></button><a href={`/api/photos/${current.id}/download`} aria-label="Tải ảnh gốc"><Download/></a><button onClick={()=>document.documentElement.requestFullscreen?.()} aria-label="Toàn màn hình"><Expand/></button><button onClick={()=>setActive(null)} aria-label="Đóng"><X/></button></div></div>
          <button className="lightbox-arrow left" onClick={()=>move(-1)} aria-label="Ảnh trước"><ChevronLeft/></button>
          <div className="lightbox-stage"><img key={current.id} src={current.src} alt={current.alt}/></div>
          <button className="lightbox-arrow right" onClick={()=>move(1)} aria-label="Ảnh sau"><ChevronRight/></button>
          <p className="lightbox-caption">{current.takenAt} · Lễ Thành Hôn</p>
        </>}
      </DialogContent>
    </Dialog>
  </>;
}
