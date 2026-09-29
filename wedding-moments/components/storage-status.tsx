"use client";
import { useState } from "react";
type Status = { database: string; originals: string; images: boolean; missing: string[] };
export function StorageStatus() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [cleanup, setCleanup] = useState("");
  async function clean() {
    setBusy(true);
    try {
      const response = await fetch("/api/photos/cleanup", { method: "POST" });
      const result = await response.json() as { removed: number; pending: number; error?: string };
      if (!response.ok) throw new Error(result.error || "Không thể dọn ảnh.");
      setCleanup(`Đã dọn ${result.removed} ảnh; ${result.pending} ảnh chờ hết hạn upload hoặc cần thử lại. Không xóa storage legacy.`);
    } catch (e) { setCleanup((e as Error).message); }
    finally { setBusy(false); }
  }
  async function check() {
    setBusy(true); setError(""); setStatus(null);
    try {
      const response = await fetch("/api/library/storage", { cache: "no-store" });
      const data = await response.json() as Status & { error?: string };
      if (!response.ok) throw new Error(data.error || "Không thể kiểm tra cấu hình.");
      setStatus(data);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <section className="admin-panel"><h2>Lưu trữ ảnh</h2>
    <p>Supabase lưu thông tin album; R2 giữ ảnh gốc. Website tự tạo ảnh thu nhỏ và ảnh xem lớn trên Vercel, lưu vào R2 để các lần xem tiếp theo nhanh hơn.</p>
    <button type="button" disabled={busy} onClick={() => void check()}>{busy ? "Đang kiểm tra…" : "Kiểm tra cấu hình"}</button>
    <button type="button" disabled={busy} onClick={() => void clean()}>Dọn file của ảnh đã xóa</button>
    {cleanup && <p role="status">{cleanup}</p>}
    {error && <p role="alert">{error}</p>}
    {status && <div role="status"><p>Dữ liệu: {status.database === "supabase" ? "Supabase" : "D1 hiện tại"} · Ảnh gốc: {status.originals === "s3" ? "R2 riêng" : "R2 hiện tại"} · Ảnh xem trước: {status.images ? "Dịch vụ xử lý ảnh" : "Tạo trên Vercel và lưu R2"}</p>
      <p>{status.missing.length ? `Cần bổ sung: ${status.missing.join(", ")}` : "Đã có các biến cấu hình cần thiết."}</p><p className="admin-muted">Đây là kiểm tra cấu hình, chưa xác nhận quyền truy cập dịch vụ. Tải một ảnh thử và tải lại ảnh gốc để kiểm tra kết nối thực tế.</p></div>}
  </section>;
}
