"use client";
import { useState } from "react";
type Status = { database: string; originals: string; images: boolean; missing: string[] };
export function StorageStatus() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
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
    <p>Supabase lưu thông tin album. R2 giữ ảnh gốc. Cloudflare Images cung cấp ảnh xem trước.</p>
    <button type="button" disabled={busy} onClick={() => void check()}>{busy ? "Đang kiểm tra…" : "Kiểm tra cấu hình"}</button>
    {error && <p role="alert">{error}</p>}
    {status && <div role="status"><p>Dữ liệu: {status.database === "supabase" ? "Supabase" : "D1 hiện tại"} · Ảnh gốc: {status.originals === "s3" ? "R2 riêng" : "R2 hiện tại"} · Cloudflare Images: {status.images ? "Đã bật" : "Chưa bật"}</p>
      <p>{status.missing.length ? `Cần bổ sung: ${status.missing.join(", ")}` : "Đã có các biến cấu hình cần thiết."}</p><p className="admin-muted">Đây là kiểm tra cấu hình, chưa xác nhận quyền truy cập dịch vụ. Tải một ảnh thử và tải lại ảnh gốc để kiểm tra kết nối thực tế.</p></div>}
  </section>;
}
