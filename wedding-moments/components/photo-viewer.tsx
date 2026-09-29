"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus, X, Heart, Download } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { Photo } from "@/lib/mock-data";
import { getPhotoPreviewUrl, getPhotoThumbnailUrl } from "@/lib/photo-urls";
import { readFavorites, writeFavorites } from "@/lib/favorites";
import { downloadOriginal } from "@/lib/save-photo";

export function PhotoViewer({ photos, index, onIndex }: { photos: Photo[]; index: number | null; onIndex: (index: number | null) => void }) {
  const [scale, setScale] = useState(1);
  const [favorites, setFavorites] = useState<Set<string>>(readFavorites);
  const [notice, setNotice] = useState("");
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const transform = useRef({ scale: 1, x: 0, y: 0 });
  const stage = useRef<HTMLDivElement | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const apply = useCallback((value: { scale: number; x: number; y: number }) => {
    const el = stage.current;
    const image = el?.querySelector("img");
    if (el && image?.naturalWidth && image.naturalHeight) {
      const style = getComputedStyle(el);
      const width = el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const height = el.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      const fit = Math.min(width / image.naturalWidth, height / image.naturalHeight);
      const bx = Math.max(0, (image.naturalWidth * fit * value.scale - width) / 2);
      const by = Math.max(0, (image.naturalHeight * fit * value.scale - height) / 2);
      value.x = Math.max(-bx, Math.min(bx, value.x));
      value.y = Math.max(-by, Math.min(by, value.y));
    }
    if (value.scale === 1) value.x = value.y = 0;
    transform.current = value; setScale(value.scale); setOffset({ x: value.x, y: value.y });
  }, []);
  const zoomAt = useCallback((value: number, from?: { x: number; y: number }, to = from) => {
    const el = stage.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    const cx = rect.left + (el.clientWidth + parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)) / 2;
    const cy = rect.top + (el.clientHeight + parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)) / 2;
    const old = transform.current;
    const next = Math.max(1, Math.min(4, value));
    const ratio = next / old.scale;
    apply({ scale: next, x: (to?.x ?? cx) - cx - ((from?.x ?? cx) - cx - old.x) * ratio,
      y: (to?.y ?? cy) - cy - ((from?.y ?? cy) - cy - old.y) * ratio });
  }, [apply]);
  const attachStage = useCallback((el: HTMLDivElement | null) => {
    stage.current = el;
    if (!el) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? el.clientHeight : 1);
      zoomAt(transform.current.scale * Math.exp(-Math.max(-200, Math.min(200, delta)) * .003), { x: event.clientX, y: event.clientY });
    };
    const resize = new ResizeObserver(() => apply({ ...transform.current }));
    resize.observe(el);
    el.addEventListener("wheel", wheel, { passive: false });
    return () => { el.removeEventListener("wheel", wheel); resize.disconnect(); pointers.current.clear(); swipe.current = null; stage.current = null; };
  }, [apply, zoomAt]);
  const photo = index === null ? null : photos[index];
  useEffect(() => {
    if (index === null || photos.length < 2) return;
    const next = new Image();
    next.src = getPhotoPreviewUrl(photos[(index + 1) % photos.length]);
    return () => { next.src = ""; };
  }, [index, photos]);
  const reset = () => { apply({ scale: 1, x: 0, y: 0 }); pointers.current.clear(); swipe.current = null; };
  const move = (delta: number) => { if (index !== null) { reset(); onIndex((index + delta + photos.length) % photos.length); } };
  useEffect(() => {
    if (index === null) return;
    const handle = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        apply({ scale: 1, x: 0, y: 0 }); pointers.current.clear(); swipe.current = null;
        onIndex((index + (event.key === "ArrowRight" ? 1 : -1) + photos.length) % photos.length);
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [index, onIndex, photos.length, apply]);
  const zoom = (value: number) => zoomAt(value);
  return <Dialog open={photo !== null && photo !== undefined} onOpenChange={open => { if (!open) { reset(); onIndex(null); } }}>
    <DialogContent className="photo-viewer" showCloseButton={false}>
      <DialogTitle className="sr-only">Phóng to ảnh</DialogTitle>
      <DialogDescription className="sr-only">Cuộn chuột hoặc chụm hai ngón tay để zoom tại vị trí đang xem. Kéo ảnh để xem chi tiết. Dùng nút cộng, trừ để thay đổi độ phóng đại.</DialogDescription>
      <div className="viewer-toolbar"><span>{index === null ? 0 : index + 1} / {photos.length}</span><div>
        {photo && <><button aria-label="Yêu thích ảnh" aria-pressed={favorites.has(photo.id)} onClick={() => { const next = readFavorites(); if (next.has(photo.id)) next.delete(photo.id); else next.add(photo.id); writeFavorites(next); setFavorites(next); }}><Heart fill={favorites.has(photo.id) ? "currentColor" : "none"} /></button>
        <button aria-label="Tải ảnh gốc" onClick={async () => { try { await downloadOriginal(photo); } catch (error) { if ((error as Error).name !== "AbortError") setNotice("Chưa thể tải ảnh gốc. Hãy thử lại."); } }}><Download /></button></>}
        <button aria-label="Thu nhỏ" disabled={scale === 1} onClick={() => zoom(scale - .5)}><Minus /></button>
        <button onClick={reset} aria-label="Vừa màn hình">{Math.round(scale * 100)}%</button>
        <button aria-label="Phóng to" disabled={scale === 4} onClick={() => zoom(scale + .5)}><Plus /></button>
        <button aria-label="Đóng ảnh" onClick={() => { reset(); onIndex(null); }}><X /></button>
      </div></div>
      {notice && <p role="alert">{notice}</p>}
      <div ref={attachStage} className="viewer-stage" style={{ touchAction: "none", cursor: scale > 1 ? "grab" : "zoom-in", backgroundImage: photo ? `url(${getPhotoThumbnailUrl(photo)})` : undefined }}
        onDoubleClick={e => zoomAt(transform.current.scale === 1 ? 2 : 1, { x: e.clientX, y: e.clientY })}
        onPointerDown={e => {
          if (e.pointerType === "mouse" && e.button !== 0) return;
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          swipe.current = pointers.current.size === 1 && transform.current.scale === 1 ? { x: e.clientX, y: e.clientY } : null;
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={e => {
          const previous = pointers.current.get(e.pointerId);
          if (!previous) return;
          const before = [...pointers.current.values()];
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          const after = [...pointers.current.values()];
          if (before.length >= 2) {
            swipe.current = null;
            const distance = (p: typeof before) => Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y);
            const center = (p: typeof before) => ({ x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 });
            if (distance(before) > 0) zoomAt(transform.current.scale * distance(after) / distance(before), center(before), center(after));
          } else if (transform.current.scale > 1) {
            swipe.current = null;
            apply({ ...transform.current, x: transform.current.x + e.clientX - previous.x, y: transform.current.y + e.clientY - previous.y });
          }
        }}
        onPointerUp={e => {
          pointers.current.delete(e.pointerId);
          if (swipe.current && transform.current.scale === 1 && e.pointerType === "touch") {
            const dx = e.clientX - swipe.current.x, dy = e.clientY - swipe.current.y;
            if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) move(dx < 0 ? 1 : -1);
          }
          swipe.current = null;
        }}
        onPointerCancel={e => { pointers.current.delete(e.pointerId); swipe.current = null; }}
        onLostPointerCapture={e => { pointers.current.delete(e.pointerId); swipe.current = null; }}>
        {photo && <img key={photo.id} src={getPhotoPreviewUrl(photo)} alt={photo.alt} draggable={false} onLoad={() => apply({ ...transform.current })} style={{ transition: "none", transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }} />}
      </div>
      {photos.length > 1 && <><button className="viewer-prev" aria-label="Ảnh trước" onClick={() => move(-1)}><ChevronLeft /></button><button className="viewer-next" aria-label="Ảnh tiếp theo" onClick={() => move(1)}><ChevronRight /></button></>}
    </DialogContent>
  </Dialog>;
}
