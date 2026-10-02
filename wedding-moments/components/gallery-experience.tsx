"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Download, Expand, Heart, ImageDown, Play, QrCode, Share2, X } from "lucide-react";
import type { Photo } from "@/lib/mock-data";
import { downloadOriginal, preparePreviewDownload } from "@/lib/save-photo";
import { readFavorites, writeFavorites } from "@/lib/favorites";
import { downloadZip } from "@/lib/download-zip";
import { getPhotoThumbnailUrl, getPhotoPreviewUrl, imageFallback } from "@/lib/photo-urls";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ReadyDownload } from "@/components/ready-download";
import { resolvePhotoIndex } from "@/lib/photo-navigation";

export function GalleryExperience({ photos, albumName, albumSlug }: { photos: Photo[]; albumName: string; albumSlug?: string }) {
  const [activePhoto, setActive] = useState<{ id: string; index: number } | null>(null);
  const active = resolvePhotoIndex(photos, activePhoto);
  const current = active === null ? null : photos[active];
  const [loadedPhotoId, setLoadedPhotoId] = useState<string | null>(null);
  const [failedPhotoId, setFailedPhotoId] = useState<string | null>(null);
  const [pageVisible, setPageVisible] = useState(true);
  const [favorites, setFavorites] = useState<Set<string>>(readFavorites);
  const [playing, setPlaying] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [downloadNotice, setDownloadNotice] = useState("");
  const touchStart = useRef<{x:number;y:number}|null>(null);
  const deepLinkHandled = useRef(false);

  const syncPhotoUrl = useCallback((photoId: string | null) => {
    const url = new URL(window.location.href);
    if (photoId) url.searchParams.set("photo", photoId); else url.searchParams.delete("photo");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);
  const openPhoto = useCallback((photoIndex: number) => {
    if (!photos[photoIndex]) return;
    setLoadedPhotoId(null); setFailedPhotoId(null);
    setActive({ id: photos[photoIndex].id, index: photoIndex });
    syncPhotoUrl(photos[photoIndex]?.id ?? null);
  }, [photos, syncPhotoUrl]);
  const closePhoto = useCallback(() => {
    setActive(null); setPlaying(false); syncPhotoUrl(null);
  }, [syncPhotoUrl]);
  useEffect(() => {
    if (!activePhoto || current) return;
    const frame = requestAnimationFrame(closePhoto);
    return () => cancelAnimationFrame(frame);
  }, [activePhoto, current, closePhoto]);

  useEffect(() => {
    if (deepLinkHandled.current || !photos.length) return;
    deepLinkHandled.current = true;
    const photoId = new URLSearchParams(window.location.search).get("photo");
    const photoIndex = photoId ? photos.findIndex(photo => photo.id === photoId) : -1;
    if (photoIndex >= 0) {
      const frame = requestAnimationFrame(() => setActive({ id: photos[photoIndex].id, index: photoIndex }));
      return () => cancelAnimationFrame(frame);
    }
  }, [photos]);

  const saveFavorites = (next:Set<string>) => { setFavorites(next); writeFavorites(next); };
  const toggleFavorite = (id:string) => { const next=new Set(favorites); if(next.has(id))next.delete(id);else next.add(id);saveFavorites(next); };
  const toggleSelected = (id:string) => { const next=new Set(selected); if(next.has(id))next.delete(id);else next.add(id);setSelected(next); };
  const move = useCallback((delta:number) => {
    if (photos.length < 2) return;
    setLoadedPhotoId(null); setFailedPhotoId(null);
    setActive(current => {
    const index = resolvePhotoIndex(photos, current);
    if (index === null) return null;
    const next = (index + delta + photos.length) % photos.length;
    syncPhotoUrl(photos[next].id);
    return { id: photos[next].id, index: next };
    });
  }, [photos, syncPhotoUrl]);
  useEffect(() => {
    if (!playing || !pageVisible || !current || photos.length < 2) return;
    if (loadedPhotoId !== current.id && failedPhotoId !== current.id) return;
    const timer = setTimeout(() => move(1), 4000);
    return () => clearTimeout(timer);
  }, [playing, pageVisible, current, loadedPhotoId, failedPhotoId, photos.length, move]);
  useEffect(() => {
    const update = () => setPageVisible(!document.hidden);
    update(); document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  useEffect(() => {
    if (active === null || photos.length < 2) return;
    const image = new Image(); image.src = getPhotoPreviewUrl(photos[(active + 1) % photos.length]);
    return () => { image.src = ""; };
  }, [active, photos]);
  useEffect(() => {
    if (activePhoto) syncPhotoUrl(current?.id ?? null);
  }, [activePhoto, current?.id, syncPhotoUrl]);
  async function downloadSelection() {
    setZipping(true);
    try {
      await downloadZip(photos.filter(p => selected.has(p.id)), (done, total) => setDownloadNotice(`Đang chuẩn bị ZIP: ${done}/${total} ảnh`));
      setDownloadNotice("Đã gửi gói ZIP tới trình duyệt.");
    } catch (error) { setDownloadNotice((error as Error).message); }
    finally { setZipping(false); }
  }

  useEffect(() => {
    const onKey=(e:KeyboardEvent)=>{ if(active===null)return; if(e.key==="ArrowRight")move(1); if(e.key==="ArrowLeft")move(-1); };
    window.addEventListener("keydown",onKey); return()=>window.removeEventListener("keydown",onKey);
  },[active,move]);

  useEffect(() => { if (current) void preparePreviewDownload(current).catch(() => undefined); }, [current]);
  const selectionLabel = useMemo(()=>`${selected.size} ảnh đã chọn`,[selected.size]);
  const share = async () => {
    const url=current?`${location.origin}${location.pathname}?photo=${current.id}`:location.href;
    if(navigator.share) await navigator.share({title:albumName,text:"Cùng xem khoảnh khắc này nhé",url});
    else { await navigator.clipboard.writeText(url); alert("Đã sao chép liên kết"); }
  };
  const downloadPhoto=async(photo:Photo)=>{try{const result=await downloadOriginal(photo);setDownloadNotice(result==="ready"?"Ảnh sẵn sàng. Chạm Lưu ảnh.":result==="shared"?"Đã mở menu lưu ảnh của điện thoại.":"Ảnh đã được tải về.")}catch(error){if((error as Error).name!=="AbortError")setDownloadNotice("Chưa thể tải ảnh. Vui lòng thử lại.")}};

  return <>
    <header className="gallery-header">
      <Link href="/" className="round-control" aria-label="Về trang chủ"><ArrowLeft size={19}/></Link>
      <div><p className="couple-name">Văn Thọ &amp; Hồng Thắm</p><h1>{albumName}</h1></div>
      <div className="gallery-actions">
        <button onClick={()=>setSelectMode(v=>!v)} className={selectMode?"text-control active":"text-control"}>{selectMode?<><X size={17}/>Thoát</>:<><Check size={17}/>Chọn ảnh</>}</button>
        <button className="round-control" onClick={share} aria-label="Chia sẻ album"><Share2 size={18}/></button>
      </div>
    </header>
    <section className="gallery-intro">
      <p className="eyebrow ink">18.10.2026 · Hà Nội</p><p>{photos.length} khoảnh khắc</p>
      <button className="slideshow-btn" onClick={() => { window.location.assign(albumSlug ? `/qr/album/${encodeURIComponent(albumSlug)}` : "/qr/library/all"); }}><QrCode size={15}/> Mã QR</button><button className="slideshow-btn" disabled={!photos.length} onClick={()=>{openPhoto(0);setPlaying(true);}}><Play size={15} fill="currentColor"/> Trình chiếu</button>
    </section>
    <section className="home-photo-grid gallery-photo-grid" aria-label={`Ảnh trong ${albumName}`}>
      {photos.map((photo,index)=><div key={photo.id} className="photo-card home-photo-card">
        <button className="photo-open" onPointerEnter={() => { const image = new Image(); image.src = getPhotoPreviewUrl(photo); }} onFocus={() => { const image = new Image(); image.src = getPhotoPreviewUrl(photo); }} onClick={()=>selectMode?toggleSelected(photo.id):openPhoto(index)} aria-label={`${selectMode?"Chọn":"Mở"} ${photo.alt}`}><img src={getPhotoThumbnailUrl(photo)} onError={imageFallback(photo,"thumbnail")} alt={photo.alt} loading={index<12?"eager":"lazy"} decoding="async" fetchPriority={index<4?"high":"auto"} /></button>
        {selectMode&&<span className={selected.has(photo.id)?"select-dot selected":"select-dot"}>{selected.has(photo.id)&&<Check size={16}/>}</span>}
        {!selectMode&&<span className="photo-time">{photo.takenAt}</span>}
        {!selectMode&&<button className="photo-download" onClick={()=>downloadPhoto(photo)}><Download size={16}/><span>Tải về</span></button>}
      </div>)}
    </section>
    {selectMode&&<div className="selection-bar" role="status"><strong>{selectionLabel}</strong><button onClick={()=>setSelected(new Set(photos.map(p=>p.id)))}>Chọn tất cả ảnh</button><button onClick={()=>{const next=new Set(favorites);selected.forEach(id=>next.add(id));saveFavorites(next)}}><Heart size={17}/>Yêu thích</button><button disabled={zipping || !selected.size} onClick={() => void downloadSelection()}><ImageDown size={17}/>{zipping ? "Đang tạo ZIP…" : "Tải ZIP (tối đa 100 ảnh / 200 MB)"}</button><button onClick={()=>setSelected(new Set())}>Bỏ chọn</button></div>}

    <Dialog open={active!==null} onOpenChange={open=>{if(!open)closePhoto();}}>
      <DialogContent className="lightbox" showCloseButton={false}>
        <DialogTitle className="sr-only">Xem ảnh toàn màn hình</DialogTitle><DialogDescription className="sr-only">Vuốt hoặc dùng phím mũi tên để chuyển ảnh.</DialogDescription>
        <ReadyDownload inViewer />
        {current&&<>
          <div className="lightbox-top"><span>{active!+1} / {photos.length}</span><div><button onClick={()=>toggleFavorite(current.id)} aria-label="Yêu thích"><Heart fill={favorites.has(current.id)?"currentColor":"none"}/></button><button onClick={share} aria-label="Chia sẻ"><Share2/></button><button onClick={()=>downloadPhoto(current)} aria-label="Tải ảnh về thiết bị"><Download/></button><button onClick={()=>document.documentElement.requestFullscreen?.()} aria-label="Toàn màn hình"><Expand/></button><button onClick={closePhoto} aria-label="Đóng"><X/></button></div></div>
          <button className="lightbox-arrow left" onClick={()=>move(-1)} aria-label="Ảnh trước"><ChevronLeft/></button>
          <div className="lightbox-stage" onTouchStart={e=>touchStart.current=e.touches.length===1?{x:e.touches[0].clientX,y:e.touches[0].clientY}:null} onTouchCancel={()=>{touchStart.current=null}} onTouchEnd={e=>{if(!touchStart.current||!e.changedTouches.length)return;const dx=e.changedTouches[0].clientX-touchStart.current.x;const dy=e.changedTouches[0].clientY-touchStart.current.y;if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy))move(dx<0?1:-1);if(dy>100&&Math.abs(dy)>Math.abs(dx))closePhoto();touchStart.current=null}}>
            <img key={current.id} src={getPhotoPreviewUrl(current)} alt={current.alt} onLoad={()=>{setLoadedPhotoId(current.id);setFailedPhotoId(null)}} onError={event=>{const src=event.currentTarget.src;imageFallback(current,"preview")(event);if(event.currentTarget.src===src)setFailedPhotoId(current.id)}}/>
            {failedPhotoId===current.id&&<p className="lightbox-status" role="status">Không thể tải ảnh. Hãy chuyển sang ảnh khác.</p>}
          </div>
          <button className="slideshow-btn lightbox-play" disabled={photos.length<2} aria-pressed={playing} onClick={() => setPlaying(p => !p)}>{playing ? "Dừng trình chiếu" : "Tiếp tục trình chiếu"}</button>
          <button className="lightbox-arrow right" onClick={()=>move(1)} aria-label="Ảnh sau"><ChevronRight/></button>
          <p className="lightbox-caption">{current.takenAt}</p>
        </>}
      </DialogContent>
    </Dialog>
    <p className="gallery-download-notice" role="status" aria-live="polite">{downloadNotice}</p>
  </>;
}
