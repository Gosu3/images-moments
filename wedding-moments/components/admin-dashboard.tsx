"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { Album, Download, ImageIcon, LayoutDashboard, LogOut, Plus, Settings, Upload } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { PhotoViewer } from "@/components/photo-viewer";
import { useLibrary } from "@/lib/use-library";
import { savePhotoToDevice } from "@/lib/save-photo";
import type { LibraryAlbum, LibraryPhoto } from "@/lib/library-model";

const sections = [
  { id: "overview", label: "Tổng quan", icon: LayoutDashboard },
  { id: "albums", label: "Album", icon: Album },
  { id: "photos", label: "Ảnh", icon: ImageIcon },
  { id: "upload", label: "Tải lên", icon: Upload },
  { id: "downloads", label: "Tải xuống", icon: Download },
  { id: "settings", label: "Cài đặt", icon: Settings },
] as const;
type Section = typeof sections[number]["id"];
type QueueItem = { id: string; file: File; album: string; progress: number; status: "waiting" | "uploading" | "done" | "failed"; error?: string };

export function AdminDashboard() {
  const { data, ready, error, reload, mutate } = useLibrary();
  const [section, setSection] = useState<Section>("overview");
  const [albumFilter, setAlbumFilter] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [viewer, setViewer] = useState<number | null>(null);
  const [editor, setEditor] = useState<LibraryAlbum | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [confirm, setConfirm] = useState<{ text: string; operation: Record<string, unknown> } | null>(null);
  const [uploadAlbum, setUploadAlbum] = useState("le-thanh-hon");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [history, setHistory] = useState<{ name: string; status: string }[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const uploading = useRef(false);
  const work = useRef<QueueItem[]>([]);
  const filtered = data.photos.filter(p => (!albumFilter || p.album === albumFilter) && (p.filename + p.alt).toLocaleLowerCase("vi").includes(query.toLocaleLowerCase("vi")));
  const currentPage = Math.min(page, Math.max(0, Math.ceil(filtered.length / 48) - 1));
  const shown = filtered.slice(currentPage * 48, currentPage * 48 + 48);
  const currentUploadAlbum = data.albums.some(a => a.slug === uploadAlbum) ? uploadAlbum : data.albums[0]?.slug ?? "";
  async function save(operation: Record<string, unknown>) {
    setBusy(true); setNotice("");
    try { await mutate(operation); setNotice("Đã lưu thay đổi."); setEditor(null); setSelected([]); }
    catch (e) { setNotice((e as Error).message); }
    finally { setBusy(false); }
  }
  async function download(photo: LibraryPhoto) {
    try {
      const result = await savePhotoToDevice(photo.src, photo.filename);
      setHistory(h => [{ name: photo.filename, status: result === "shared" ? "Đã mở menu lưu ảnh" : "Đã gửi tới trình duyệt để tải" }, ...h]);
    } catch (e) {
      if ((e as Error).name !== "AbortError") { setNotice("Không thể tải " + photo.filename); setHistory(h => [{ name: photo.filename, status: "Tải thất bại" }, ...h]); }
    }
  }
  async function drainQueue() {
    if (uploading.current) return;
    uploading.current = true;
    while (work.current.length) {
      const item = work.current.shift()!;
      setQueue(q => q.map(x => x.id === item.id ? { ...x, status: "uploading" } : x));
      try {
        const bitmap = await createImageBitmap(item.file);
        const form = new FormData(); form.append("file", item.file); form.append("album", item.album);
        form.append("width", String(bitmap.width)); form.append("height", String(bitmap.height)); bitmap.close();
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", "/api/library/upload"); xhr.timeout = 180000;
          xhr.upload.onprogress = e => { if (e.lengthComputable) setQueue(q => q.map(x => x.id === item.id ? { ...x, progress: Math.min(99, Math.round(e.loaded / e.total * 100)) } : x)); };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve();
            else { let message = "Không thể tải ảnh."; try { message = JSON.parse(xhr.responseText).error || message; } catch {} reject(new Error(message)); }
          };
          xhr.onerror = () => reject(new Error("Mất kết nối. Hãy thử lại."));
          xhr.ontimeout = () => reject(new Error("Tải ảnh quá lâu. Hãy thử lại."));
          xhr.send(form);
        });
        setQueue(q => q.map(x => x.id === item.id ? { ...x, progress: 100, status: "done" } : x));
      } catch (e) { setQueue(q => q.map(x => x.id === item.id ? { ...x, status: "failed", error: (e as Error).message } : x)); }
    }
    uploading.current = false; await reload();
  }
  function addFiles(files: FileList | null) {
    if (!files || !ready || !currentUploadAlbum) return;
    const items: QueueItem[] = Array.from(files).map(file => ({
      id: crypto.randomUUID(), file, album: currentUploadAlbum, progress: 0,
      status: !["image/jpeg", "image/png", "image/webp"].includes(file.type) || !file.size || file.size > 50 * 1024 * 1024 ? "failed" : "waiting",
      error: "Chỉ nhận JPEG, PNG, WebP tối đa 50 MB.",
    }));
    work.current.push(...items.filter(x => x.status === "waiting")); setQueue(q => [...q, ...items]); void drainQueue();
  }
  const albumSelect = (value: string, change: (value: string) => void, all = false) => <select aria-label="Album ảnh" value={value} onChange={e => change(e.target.value)}>{all && <option value="">Tất cả album</option>}{data.albums.map(a => <option key={a.slug} value={a.slug}>{a.name}</option>)}</select>;
  return <div className="admin-shell">
    <aside className="admin-sidebar"><Link className="admin-brand" href="/"><span>WM</span><div>Wedding<br />Moments</div></Link>
      <nav aria-label="Quản trị">{sections.map(({ id, label, icon: Icon }) => <button key={id} aria-current={section === id ? "page" : undefined} className={section === id ? "active" : ""} onClick={() => { setSection(id); setNotice(""); }}><Icon size={18} />{label}</button>)}</nav>
      <Link href="/" className="admin-logout"><LogOut size={17} />Xem trang cưới</Link>
    </aside>
    <main className="admin-main"><header><div><p>Quản trị thư viện</p><h1>{sections.find(s => s.id === section)?.label}</h1></div><div className="admin-user"><span>TN</span><div><strong>{data.settings.adminName}</strong><small>Quản trị viên</small></div></div></header>
      <div className="admin-content">
        {error && <div className="admin-alert" role="alert">{error} <a href="/signin-with-chatgpt?return_to=/admin" target="_top">Đăng nhập</a><button onClick={() => void reload()}>Thử lại</button></div>}
        {notice && <p className="admin-notice" role="status">{notice}</p>}
        {section === "overview" && <>
          <div className="admin-stats"><article><small>Album</small><strong>{data.albums.length}</strong></article><article><small>Ảnh trong thư viện</small><strong>{data.photos.length}</strong></article><article><small>Ảnh đã tải lên</small><strong>{data.photos.filter(p => !p.demo).length}</strong></article></div>
          <section className="admin-panel"><h2>Thư viện của Thọ Nguyễn</h2><p>Quản lý album, sắp xếp ảnh và tải ảnh gốc ở một nơi.</p><div className="admin-toolbar"><button onClick={() => setSection("upload")}>Tải ảnh lên</button><button onClick={() => setSection("albums")}>Quản lý album</button></div></section>
          {data.photos.some(p => p.demo) && <p className="admin-muted">Thư viện hiện có ảnh mẫu lặp lại để minh họa bố cục. Ảnh bạn tải lên sẽ được lưu riêng, giữ nguyên file gốc.</p>}
          <section className="admin-panel"><h2>Các album</h2>{data.albums.map(a => <button className="admin-album-row" key={a.slug} onClick={() => { setAlbumFilter(a.slug); setPage(0); setSection("photos"); }}><span>{a.name}</span><span>{data.photos.filter(p => p.album === a.slug).length} ảnh</span></button>)}</section>
        </>}
        {section === "albums" && <>
          <div className="admin-toolbar"><h2>Album ảnh</h2><button disabled={!ready || busy} onClick={() => setEditor({ slug: crypto.randomUUID(), name: "", time: "" })}><Plus size={16} />Tạo album</button></div>
          {editor && <form className="admin-panel admin-form" onSubmit={e => { e.preventDefault(); void save({ action: "album", ...editor }); }}>
            <label>Tên album<input required maxLength={100} value={editor.name} onChange={e => setEditor({ ...editor, name: e.target.value })} /></label>
            <label>Ngày / mô tả<input maxLength={100} value={editor.time} onChange={e => setEditor({ ...editor, time: e.target.value })} /></label>
            <div className="admin-toolbar"><button disabled={busy}>Lưu album</button><button type="button" onClick={() => setEditor(null)}>Hủy</button></div>
          </form>}
          <div className="admin-album-grid">{data.albums.map(a => { const pictures = data.photos.filter(p => p.album === a.slug); return <article className="admin-panel" key={a.slug}>
            {pictures[0] ? <img src={pictures[0].preview} alt={a.name} /> : <div className="admin-empty">Chưa có ảnh</div>}
            <h3>{a.name}</h3><p>{a.time} · {pictures.length} ảnh</p><div className="admin-toolbar">
              <button onClick={() => { setAlbumFilter(a.slug); setSection("photos"); setPage(0); }}>Xem ảnh</button>
              <button disabled={!ready || busy} onClick={() => setEditor({ ...a })}>Sửa</button>
              <button disabled={!ready || busy || pictures.length > 0} title={pictures.length ? "Chuyển hoặc xóa ảnh trước khi xóa album" : "Xóa album trống"} onClick={() => setConfirm({ text: `Xóa album trống “${a.name}”?`, operation: { action: "deleteAlbum", slug: a.slug } })}>Xóa</button>
            </div></article>; })}</div>
        </>}
        {(section === "photos" || section === "downloads") && <>
          <div className="admin-toolbar">{albumSelect(albumFilter, v => { setAlbumFilter(v); setPage(0); setSelected([]); }, true)}<input aria-label="Tìm ảnh" placeholder="Tìm tên ảnh…" value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} /><span>{filtered.length} ảnh</span></div>
          {section === "photos" && <div className="admin-toolbar">
            <button onClick={() => setSelected(shown.every(p => selected.includes(p.id)) ? selected.filter(id => !shown.some(p => p.id === id)) : Array.from(new Set([...selected, ...shown.map(p => p.id)])))}>Chọn / bỏ chọn trang này</button><span>{selected.length} đã chọn</span>
            <select aria-label="Chuyển ảnh đến album" value="" disabled={!ready || busy || !selected.length} onChange={e => { if (e.target.value) void save({ action: "movePhotos", ids: selected, album: e.target.value }); }}><option value="">Chuyển đến album…</option>{data.albums.map(a => <option key={a.slug} value={a.slug}>{a.name}</option>)}</select>
            <button disabled={!ready || busy || !selected.length} onClick={() => setConfirm({ text: `Xóa ${selected.length} ảnh khỏi thư viện? File gốc trong kho lưu trữ được giữ lại để có thể khôi phục.`, operation: { action: "deletePhotos", ids: selected } })}>Xóa ảnh đã chọn</button>
          </div>}
          <div className="admin-photo-grid">{shown.map((p, i) => <article key={p.id}>
            <button className="admin-photo-preview" aria-label={`Phóng to ${p.alt}`} onClick={() => setViewer(currentPage * 48 + i)}><img src={p.preview} alt={p.alt} loading="lazy" /></button>
            <div>{section === "photos" && <input type="checkbox" aria-label={`Chọn ${p.alt}`} checked={selected.includes(p.id)} onChange={e => setSelected(ids => e.target.checked ? [...ids, p.id] : ids.filter(id => id !== p.id))} />}<span title={p.filename}>{p.filename}</span><button aria-label={`Tải ${p.filename}`} onClick={() => void download(p)}><Download size={17} /></button></div>
          </article>)}</div>
          {!filtered.length && <p className="admin-empty">Không có ảnh phù hợp.</p>}
          <div className="admin-toolbar admin-pagination"><button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Trang trước</button><span>{currentPage + 1} / {Math.max(1, Math.ceil(filtered.length / 48))}</span><button disabled={(currentPage + 1) * 48 >= filtered.length} onClick={() => setPage(currentPage + 1)}>Trang sau</button></div>
          {section === "downloads" && <section className="admin-panel"><h2>Lượt tải trong phiên này</h2>{history.length ? history.map((h, i) => <p key={i}>{h.name} · {h.status}</p>) : <p>Chưa có lượt tải. Chọn nút tải trên ảnh để lưu file gốc.</p>}</section>}
          <PhotoViewer photos={filtered} index={viewer} onIndex={setViewer} />
        </>}
        {section === "upload" && <section className="admin-panel">
          <h2>Thêm ảnh gốc</h2><div className="admin-toolbar">{albumSelect(currentUploadAlbum, setUploadAlbum)}<span>JPEG, PNG, WebP · Tối đa 50 MB/ảnh</span></div>
          <button className="dropzone" disabled={!ready || !currentUploadAlbum} onClick={() => fileInput.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files); }}><Plus /><strong>Kéo thả hoặc chọn ảnh</strong></button>
          <input ref={fileInput} hidden type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e => { addFiles(e.target.files); e.target.value = ""; }} />
          <div className="admin-toolbar"><h3>Hàng đợi</h3><button disabled={queue.some(q => q.status === "waiting" || q.status === "uploading")} onClick={() => setQueue([])}>Dọn danh sách</button></div>
          {!queue.length && <p className="admin-empty">Chưa có ảnh trong hàng đợi.</p>}
          {queue.map(item => <div className="admin-upload-row" key={item.id}><div><strong>{item.file.name}</strong><small>{(item.file.size / 1024 / 1024).toFixed(1)} MB · {item.status === "done" ? "Đã lưu" : item.status === "failed" ? item.error : item.status === "uploading" ? "Đang tải…" : "Đang chờ"}</small><progress max={100} value={item.progress} /></div>
            {item.status === "failed" && <button disabled={!ready} onClick={() => { if (work.current.some(q => q.id === item.id)) return; work.current.push(item); setQueue(q => q.map(x => x.id === item.id ? { ...x, status: "waiting", progress: 0 } : x)); void drainQueue(); }}>Thử lại</button>}</div>)}
        </section>}
        {section === "settings" && <form key={data.revision} className="admin-panel admin-form" onSubmit={e => { e.preventDefault(); const form = new FormData(e.currentTarget); void save({ action: "settings", adminName: form.get("adminName"), title: form.get("title") }); }}>
          <h2>Thông tin thư viện</h2><label>Tên quản trị viên<input name="adminName" required maxLength={100} defaultValue={data.settings.adminName} /></label><label>Tiêu đề thư viện ảnh<input name="title" required maxLength={150} defaultValue={data.settings.title} /></label>
          <p className="admin-muted">Máy tính tải file qua trình duyệt. Điện thoại hỗ trợ chia sẻ file sẽ mở menu lưu ảnh của hệ thống.</p><button disabled={!ready || busy} type="submit">Lưu cài đặt</button>
        </form>}
      </div>
      <AlertDialog open={confirm !== null} onOpenChange={open => { if (!open) setConfirm(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Xác nhận xóa</AlertDialogTitle><AlertDialogDescription>{confirm?.text}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Hủy</AlertDialogCancel><AlertDialogAction onClick={() => { if (confirm) void save(confirm.operation); setConfirm(null); }}>Xóa</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </main>
  </div>;
}
