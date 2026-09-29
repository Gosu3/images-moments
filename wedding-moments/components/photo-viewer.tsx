"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { Photo } from "@/lib/mock-data";

export function PhotoViewer({ photos, index, onIndex }: { photos: Photo[]; index: number | null; onIndex: (index: number | null) => void }) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const photo = index === null ? null : photos[index];
  const reset = () => { setScale(1); setOffset({ x: 0, y: 0 }); };
  const move = (delta: number) => { if (index !== null) { reset(); onIndex((index + delta + photos.length) % photos.length); } };
  useEffect(() => {
    if (index === null) return;
    const handle = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        setScale(1); setOffset({ x: 0, y: 0 });
        onIndex((index + (event.key === "ArrowRight" ? 1 : -1) + photos.length) % photos.length);
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [index, onIndex, photos.length]);
  const zoom = (value: number) => { setScale(Math.max(1, Math.min(4, value))); setOffset({ x: 0, y: 0 }); };
  return <Dialog open={photo !== null && photo !== undefined} onOpenChange={open => { if (!open) { reset(); onIndex(null); } }}>
    <DialogContent className="photo-viewer" showCloseButton={false}>
      <DialogTitle className="sr-only">Phóng to ảnh</DialogTitle>
      <DialogDescription className="sr-only">Ảnh vừa màn hình theo tỷ lệ gốc. Dùng nút cộng để phóng to và kéo ảnh để xem chi tiết.</DialogDescription>
      <div className="viewer-toolbar"><span>{index === null ? 0 : index + 1} / {photos.length}</span><div>
        <button aria-label="Thu nhỏ" disabled={scale === 1} onClick={() => zoom(scale - .5)}><Minus /></button>
        <button onClick={reset} aria-label="Vừa màn hình">{Math.round(scale * 100)}%</button>
        <button aria-label="Phóng to" disabled={scale === 4} onClick={() => zoom(scale + .5)}><Plus /></button>
        <button aria-label="Đóng ảnh" onClick={() => { reset(); onIndex(null); }}><X /></button>
      </div></div>
      <div className="viewer-stage" style={{ touchAction: scale > 1 ? "none" : "pan-y", cursor: scale > 1 ? "grab" : "zoom-in" }}
        onDoubleClick={() => zoom(scale === 1 ? 2 : 1)}
        onPointerDown={e => { drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }; if (scale > 1) e.currentTarget.setPointerCapture(e.pointerId); }}
        onPointerMove={e => { if (scale > 1 && drag.current) {
          const boundX = e.currentTarget.clientWidth * (scale - 1) / 2;
          const boundY = e.currentTarget.clientHeight * (scale - 1) / 2;
          setOffset({ x: Math.max(-boundX, Math.min(boundX, drag.current.ox + e.clientX - drag.current.x)), y: Math.max(-boundY, Math.min(boundY, drag.current.oy + e.clientY - drag.current.y)) });
        } }}
        onPointerUp={e => { if (drag.current && scale === 1 && e.pointerType === "touch") { const dx = e.clientX - drag.current.x; const dy = e.clientY - drag.current.y; if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) move(dx < 0 ? 1 : -1); } drag.current = null; }}
        onPointerCancel={() => { drag.current = null; }}>
        {photo && <img key={photo.id} src={photo.src} alt={photo.alt} draggable={false} style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }} />}
      </div>
      {photos.length > 1 && <><button className="viewer-prev" aria-label="Ảnh trước" onClick={() => move(-1)}><ChevronLeft /></button><button className="viewer-next" aria-label="Ảnh tiếp theo" onClick={() => move(1)}><ChevronRight /></button></>}
    </DialogContent>
  </Dialog>;
}
