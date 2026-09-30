"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Album, Download, ImageIcon, LayoutDashboard, LogOut, Plus, Settings, Upload } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { PhotoViewer } from "@/components/photo-viewer";
import { useLibrary } from "@/lib/use-library";
import type { LibraryAlbum, LibraryPhoto } from "@/lib/library-model";
import { prepareUpload } from "@/lib/image-upload";
import { StorageStatus } from "@/components/storage-status";
import { uploadDirect } from "@/lib/direct-upload";
import { getPhotoThumbnailUrl, isPhotoReady } from "@/lib/photo-urls";
import { downloadOriginal } from "@/lib/save-photo";

const sections = [
  { id: "overview", label: "Tổng quan", icon: LayoutDashboard },
  { id: "albums", label: "Album", icon: Album },
  { id: "photos", label: "Ảnh", icon: ImageIcon },
  { id: "upload", label: "Tải lên", icon: Upload },
  { id: "downloads", label: "Tải xuống", icon: Download },
  { id: "settings", label: "Cài đặt", icon: Settings },
] as const;
type Section = typeof sections[number]["id"];
type QueueItem = { id: string; file: File; album: string; progress: number; status: "waiting" | "uploading" | "done" | "failed"; error?: string; warning?: string };

export function AdminDashboard() {
  const router = useRouter();
  const { data, ready, error, authRequired, reload, mutate } = useLibrary(true);
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
  const [signingOut, setSigningOut] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const uploading = useRef(false);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const paused = useRef(false);
  const [queuePaused, setQueuePaused] = useState(false);
  const work = useRef<QueueItem[]>([]);
  const filtered = data.photos.filter(p => isPhotoReady(p) && (!albumFilter || p.album === albumFilter) && (p.filename + p.alt).toLocaleLowerCase("vi").includes(query.toLocaleLowerCase("vi")));
  const currentPage = Math.min(page, Math.max(0, Math.ceil(filtered.length / 48) - 1));
  const shown = filtered.slice(currentPage * 48, currentPage * 48 + 48);
  const currentUploadAlbum = data.albums.some(a => a.slug === uploadAlbum) ? uploadAlbum : data.albums[0]?.slug ?? "";
  useEffect(() => () => { if (reloadTimer.current) clearTimeout(reloadTimer.current); }, []);
  function scheduleLibraryReload() {
    if (reloadTimer.current) return;
    reloadTimer.current = setTimeout(() => { reloadTimer.current = null; void reload(); }, 750);
  }
  async function signOut() {
    setSigningOut(true);
    try {
      await fetch("/api/admin/session", { method: "DELETE" });
    } finally {
      router.replace("/admin/login");
      router.refresh();
    }
  }
  async function retryProcessing(id: string) {
    setBusy(true);
    try {
      const response = await fetch("/api/uploads/finalize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ photoId: id }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Không thể xử lý ảnh.");
      setNotice("Ảnh đã sẵn sàng trong thư viện.");
    } catch (e) { setNotice((e as Error).message); }
    finally { await reload(); setBusy(false); }
  }
  async function save(operation: Record<string, unknown>) {
    setBusy(true); setNotice("");
    try { await mutate(operation); setNotice("Đã lưu thay đổi."); setEditor(null); setSelected([]); }
    catch (e) { setNotice((e as Error).message); }
    finally { setBusy(false); }
  }
  async function download(photo: LibraryPhoto) {
    setNotice("Đang tải ảnh gốc…");
    try {
      const result = await downloadOriginal(photo);
      setNotice(result === "ready" ? "Ảnh đã sẵn sàng. Chạm Lưu ảnh để lưu vào điện thoại." : result === "shared" ? "Đã mở menu lưu ảnh." : "Đã gửi ảnh tới trình duyệt.");
      setHistory(h => [{ name: photo.filename, status: result === "ready" ? "Ảnh sẵn sàng lưu" : result === "shared" ? "Đã mở menu lưu ảnh" : "Đã gửi tới trình duyệt để tải" }, ...h]);
    } catch (e) {
      if ((e as Error).name !== "AbortError") { setNotice("Không thể tải " + photo.filename); setHistory(h => [{ name: photo.filename, status: "Tải thất bại" }, ...h]); }
    }
  }
  async function drainQueue() {
    if (uploading.current) return;
    uploading.current = true;
    try {
    // Discover once per batch: legacy uploads don't need a SHA-256 presign
    // round trip or a generated preview when Cloudflare Images is disabled.
    const response = await fetch("/api/library/storage", { cache: "no-store" });
    const config = await response.json() as { pipeline: string; images: boolean; error?: string };
    if (!response.ok) throw new Error(config.error || "Không thể kiểm tra cấu hình upload.");
    const worker = async () => {
    while (work.current.length && !paused.current) {
      const item = work.current.shift()!;
      setQueue(q => q.map(x => x.id === item.id ? { ...x, status: "uploading" } : x));
      try {
        const direct = config.pipeline !== "legacy" && await uploadDirect(item.file, item.album, item.id, progress => setQueue(q => q.map(x => x.id === item.id ? { ...x, progress } : x)));
        if (direct) {
          setQueue(q => q.map(x => x.id === item.id ? { ...x, progress: 100, status: "done", warning: undefined } : x));
          scheduleLibraryReload();
          continue;
        }
        const prepared = await prepareUpload(item.file, config.images, config.pipeline === "legacy");
        const form = new FormData(); form.append("file", prepared.uploadFile); form.append("album", item.album);
        form.append("width", String(prepared.width)); form.append("height", String(prepared.height));
        if (prepared.preview) form.append("preview", prepared.preview);
        form.append("uploadId", item.id);
        const warning = await new Promise<string | undefined>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", "/api/library/upload"); xhr.timeout = 180000;
          xhr.upload.onprogress = e => { if (e.lengthComputable) {
            const progress = Math.min(95, Math.round(e.loaded / e.total * 95));
            setQueue(q => q.map(x => x.id === item.id && x.progress !== progress ? { ...x, progress } : x));
          } };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) { try { resolve(JSON.parse(xhr.responseText).warning); } catch { reject(new Error("Phản hồi tải ảnh không hợp lệ.")); } }
            else { let message = "Không thể tải ảnh."; try { message = JSON.parse(xhr.responseText).error || message; } catch {} reject(new Error(message)); }
          };
          xhr.onerror = () => reject(new Error("Mất kết nối. Hãy thử lại."));
          xhr.ontimeout = () => reject(new Error("Tải ảnh quá lâu. Hãy thử lại."));
          xhr.send(form);
        });
        const localWarning = prepared.optimized ? `Ảnh ${item.file.name} đã được tối ưu WebP chất lượng cao để vượt giới hạn upload của Vercel.` : undefined;
        setQueue(q => q.map(x => x.id === item.id ? { ...x, progress: 100, status: "done", warning: warning || localWarning } : x));
        scheduleLibraryReload();
      } catch (e) { setQueue(q => q.map(x => x.id === item.id ? { ...x, status: "failed", error: (e as Error).message } : x)); }
    }
    };
    // Bound memory, bandwidth and concurrent database writers for large batches.
    await Promise.all(Array.from({ length: 4 }, worker));
    } catch (e) {
      const pending = new Set(work.current.splice(0).map(item => item.id));
      setQueue(q => q.map(item => pending.has(item.id) ? { ...item, status: "failed", error: (e as Error).message } : item));
    } finally {
      uploading.current = false;
      await reload();
      if (work.current.length && !paused.current) void drainQueue();
    }
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
    <aside className="admin-sidebar"><Link className="admin-brand" href="/" aria-label="Văn Thọ & Hồng Thắm - Trang chủ"><span className="couple-logo" aria-hidden="true"><i>&amp;</i><b>Thọ</b><b>Thắm</b></span></Link>
      <nav aria-label="Quản trị">{sections.map(({ id, label, icon: Icon }) => <button key={id} aria-current={section === id ? "page" : undefined} className={section === id ? "active" : ""} onClick={() => { setSection(id); setNotice(""); }}><Icon size={18} />{label}</button>)}</nav>
      <button className="admin-logout" disabled={signingOut} onClick={() => void signOut()}><LogOut size={17} />{signingOut ? "Đang đăng xuất…" : "Đăng xuất"}</button>
    </aside>
    <main className="admin-main"><header><div><p>Quản trị thư viện</p><h1>{sections.find(s => s.id === section)?.label}</h1></div><div className="admin-user"><span>TN</span><div><strong>{data.settings.adminName}</strong><small>Quản trị viên</small></div></div></header>
      <div className="admin-content">
        {error && <div className="admin-alert" role="alert">{error} {authRequired && <a href="/admin/login?return_to=%2Fadmin">Đăng nhập lại</a>}<button onClick={() => void reload()}>Thử lại</button></div>}
        {notice && <p className="admin-notice" role="status">{notice}</p>}
        {section === "overview" && <>
          <div className="admin-stats"><article><small>Album</small><strong>{data.albums.length}</strong></article><article><small>Ảnh trong thư viện</small><strong>{data.photos.length}</strong></article><article><small>Ảnh đã tải lên</small><strong>{data.photos.filter(p => !p.demo).length}</strong></article></div>
          <section className="admin-panel"><h2>Thư viện của {data.settings.adminName}</h2><p>Quản lý album, sắp xếp ảnh và tải ảnh gốc ở một nơi.</p><div className="admin-toolbar"><button className="admin-primary" onClick={() => setSection("upload")}>Tải ảnh lên</button><button onClick={() => setSection("albums")}>Quản lý album</button></div></section>
          {data.photos.some(p => p.demo) && <p className="admin-muted">Thư viện hiện có ảnh mẫu lặp lại để minh họa bố cục. Ảnh bạn tải lên sẽ được lưu riêng, giữ nguyên file gốc.</p>}
          <section className="admin-panel"><h2>Các album</h2>{data.albums.map(a => <button className="admin-album-row" key={a.slug} onClick={() => { setAlbumFilter(a.slug); setPage(0); setSection("photos"); }}><span>{a.name}</span><span>{data.photos.filter(p => p.album === a.slug).length} ảnh</span></button>)}</section>
        </>}
        {section === "albums" && <>
          <div className="admin-toolbar"><h2>Album ảnh</h2><button className="admin-primary" disabled={!ready || busy} onClick={() => setEditor({ slug: crypto.randomUUID(), name: "", time: "" })}><Plus size={16} />Tạo album</button></div>
          {editor && <form className="admin-panel admin-form" onSubmit={e => { e.preventDefault(); void save({ action: "album", ...editor }); }}>
            <label>Tên album<input required maxLength={100} value={editor.name} onChange={e => setEditor({ ...editor, name: e.target.value })} /></label>
            <label>Ngày / mô tả<input maxLength={100} value={editor.time} onChange={e => setEditor({ ...editor, time: e.target.value })} /></label>
            <div className="admin-toolbar"><button disabled={busy}>Lưu album</button><button type="button" onClick={() => setEditor(null)}>Hủy</button></div>
          </form>}
          <div className="admin-album-grid">{data.albums.map(a => { const pictures = data.photos.filter(p => p.album === a.slug); return <article className="admin-panel" key={a.slug}>
            {pictures.find(isPhotoReady) ? <img src={getPhotoThumbnailUrl(pictures.find(isPhotoReady)!)} alt={a.name} /> : <div className="admin-empty">Chưa có ảnh</div>}
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
            <button disabled={!ready || busy || !selected.length} onClick={() => setConfirm({ text: `Xóa ${selected.length} ảnh khỏi thư viện? Ảnh dùng hệ thống mới sẽ được dọn cả original và preview sau thời gian an toàn; ảnh legacy được giữ chờ migration.`, operation: { action: "deletePhotos", ids: selected } })}>Xóa ảnh đã chọn</button>
          </div>}
          <div className="admin-photo-grid">{shown.map((p, i) => <article key={p.id}>
            <button className="admin-photo-preview" aria-label={`Phóng to ${p.alt}`} onClick={() => setViewer(currentPage * 48 + i)}><img src={getPhotoThumbnailUrl(p)} alt={p.alt} loading="lazy" /></button>
            <div>{section === "photos" && <input type="checkbox" aria-label={`Chọn ${p.alt}`} checked={selected.includes(p.id)} onChange={e => setSelected(ids => e.target.checked ? [...ids, p.id] : ids.filter(id => id !== p.id))} />}<span title={p.filename}>{p.filename}</span><button aria-label={`Tải ${p.filename}`} onClick={() => void download(p)}><Download size={17} /></button></div>
          </article>)}</div>
          {!filtered.length && <p className="admin-empty">Không có ảnh phù hợp.</p>}
          <div className="admin-toolbar admin-pagination"><button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Trang trước</button><span>{currentPage + 1} / {Math.max(1, Math.ceil(filtered.length / 48))}</span><button disabled={(currentPage + 1) * 48 >= filtered.length} onClick={() => setPage(currentPage + 1)}>Trang sau</button></div>
          {section === "downloads" && <section className="admin-panel"><h2>Lượt tải trong phiên này</h2>{history.length ? history.map((h, i) => <p key={i}>{h.name} · {h.status}</p>) : <p>Chưa có lượt tải. Chọn nút tải trên ảnh để lưu file gốc.</p>}</section>}
          <PhotoViewer photos={filtered} index={viewer} onIndex={setViewer} />
        </>}
        {section === "upload" && <section className="admin-panel admin-upload-panel">
          <h2>Thêm ảnh gốc</h2><div className="admin-toolbar">{albumSelect(currentUploadAlbum, setUploadAlbum)}<span>JPEG, PNG, WebP · Tối đa 50 MB/ảnh</span></div>
          {data.photos.filter(p => (p.pipeline === "r2-v2" || p.pipeline === "r2-direct") && p.status !== "ready" && p.status !== "deleted").map(p => <div className="admin-upload-row" key={p.id}><div><strong>{p.filename}</strong><small>{p.status === "processing" ? "Đang tạo thumbnail và preview" : p.status === "pending" ? "Chờ upload R2 hoàn tất" : "Xử lý thất bại"}</small></div><button disabled={busy} onClick={() => void retryProcessing(p.id)}>Thử lại xử lý</button><button disabled={busy} onClick={() => setConfirm({ text: `Xóa ảnh chưa hoàn tất “${p.filename}” và dọn file liên quan?`, operation: { action: "deletePhotos", ids: [p.id] } })}>Xóa</button></div>)}
          <button className="dropzone" disabled={!ready || !currentUploadAlbum} onClick={() => fileInput.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files); }}><Plus /><strong>Kéo thả hoặc chọn ảnh</strong></button>
          <input ref={fileInput} hidden type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e => { addFiles(e.target.files); e.target.value = ""; }} />
          <p className="admin-muted">Giữ nguyên ảnh gốc · Tải đồng thời 4 ảnh</p>
          <div className="queue-summary"><div className="queue-summary-heading"><h3>Hàng đợi</h3><span>{queue.length} ảnh</span></div><div className="queue-counts" role="status"><span><i className="queue-dot done" />{queue.filter(q => q.status === "done").length} xong</span><span><i className="queue-dot uploading" />{queue.filter(q => q.status === "uploading").length} đang tải</span><span><i className="queue-dot waiting" />{queue.filter(q => q.status === "waiting").length} chờ</span><span><i className="queue-dot failed" />{queue.filter(q => q.status === "failed").length} lỗi</span></div><progress aria-label="Tiến độ hàng đợi" max={Math.max(1, queue.length * 100)} value={queue.reduce((total, item) => total + (item.status === "done" ? 100 : item.status === "uploading" ? item.progress : 0), 0)} /></div>
          <div className="admin-toolbar queue-actions">
            <button onClick={() => { paused.current = !paused.current; setQueuePaused(paused.current); if (!paused.current) void drainQueue(); }}>{queuePaused ? "Tiếp tục" : "Tạm dừng"}</button>
            <button disabled={!queue.some(q => q.status === "failed")} onClick={() => {
              const failed = queue.filter(q => q.status === "failed" && ["image/jpeg", "image/png", "image/webp"].includes(q.file.type) && q.file.size > 0 && q.file.size <= 50 * 1024 * 1024);
              work.current.push(...failed.filter(q => !work.current.some(w => w.id === q.id)));
              const ids = new Set(failed.map(q => q.id));
              setQueue(q => q.map(x => ids.has(x.id) ? { ...x, status: "waiting", progress: 0 } : x)); void drainQueue();
            }}>Thử lại ảnh lỗi</button>
            <button disabled={queue.some(q => q.status === "waiting" || q.status === "uploading")} onClick={() => setQueue([])}>Dọn danh sách</button></div>
          {!queue.length && <p className="admin-empty">Chưa có ảnh trong hàng đợi.</p>}
          <div className="upload-queue-list" aria-label="Danh sách tải ảnh">{queue.filter(item => item.status !== "done" || item.warning).slice(0, 100).map(item => <div className="admin-upload-row" key={item.id}><div><strong title={item.file.name}>{item.file.name}</strong><small>{(item.file.size / 1024 / 1024).toFixed(1)} MB · {item.status === "done" ? item.warning || "Đã lưu ảnh gốc" : item.status === "failed" ? item.error : item.status === "uploading" ? item.progress >= 95 ? "Đang lưu / xử lý ảnh…" : `Đang tải ${item.progress}%` : "Đang chờ"}</small><progress aria-label={`Tiến độ ${item.file.name}`} max={100} value={item.progress} /></div>
            {(item.status === "failed" || item.status === "done" && item.warning) && <button disabled={!ready} onClick={() => { if (work.current.some(q => q.id === item.id)) return; work.current.push(item); setQueue(q => q.map(x => x.id === item.id ? { ...x, status: "waiting", progress: 0 } : x)); void drainQueue(); }}>Thử lại</button>}</div>)}</div>
          {queue.filter(item => item.status !== "done" || item.warning).length > 100 && <p>Hiển thị 100 ảnh đầu trong hàng đợi; các ảnh còn lại vẫn được tải tự động.</p>}
        </section>}
        {section === "settings" && <><StorageStatus /><form className="admin-panel admin-form" onSubmit={e => { e.preventDefault(); const form = new FormData(e.currentTarget); void save({ action: "settings", adminName: form.get("adminName"), title: form.get("title") }); }}>
          <h2>Thông tin thư viện</h2><label>Tên quản trị viên<input name="adminName" required maxLength={100} defaultValue={data.settings.adminName} /></label><label>Tiêu đề thư viện ảnh<input name="title" required maxLength={150} defaultValue={data.settings.title} /></label>
          <p className="admin-muted">Máy tính tải file qua trình duyệt. Điện thoại hỗ trợ chia sẻ file sẽ mở menu lưu ảnh của hệ thống.</p><button disabled={!ready || busy} type="submit">Lưu cài đặt</button>
        </form></>}
      </div>
      <AlertDialog open={confirm !== null} onOpenChange={open => { if (!open) setConfirm(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Xác nhận xóa</AlertDialogTitle><AlertDialogDescription>{confirm?.text}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Hủy</AlertDialogCancel><AlertDialogAction onClick={() => { if (confirm) void save(confirm.operation); setConfirm(null); }}>Xóa</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </main>
  </div>;
}
