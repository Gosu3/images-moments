"use client";
import { useCallback, useEffect, useState } from "react";
import type { LibraryPhoto } from "@/lib/library-model";

// Cloudflare R2 free tier (per month): 10 GB-month storage,
// 1M Class A ops (PUT/LIST), 10M Class B ops (GET/HEAD). Egress is free.
const FREE_BYTES = 10 * 1024 ** 3;
const FREE_CLASS_A = 1_000_000, FREE_CLASS_B = 10_000_000;
type Operations = { classA: number; classB: number; free: number; since: string };
type Report = { objects: number; totalBytes: number; variants: { count: number; bytes: number }; truncated: boolean;
  orphans: { count: number; bytes: number }; awaitingCleanup: { count: number; bytes: number }; missing: { count: number } };

export function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toLocaleString("vi-VN", { maximumFractionDigits: i > 1 ? 2 : 0 })} ${units[i]}`;
}

async function fetchReport(): Promise<Report> {
  const response = await fetch("/api/photos/inventory", { cache: "no-store" });
  if (!response.ok) throw new Error(((await response.json().catch(() => null)) as { error?: string } | null)?.error ?? `Lỗi ${response.status}`);
  return response.json();
}

async function fetchOperations(): Promise<Operations> {
  const response = await fetch("/api/photos/operations", { cache: "no-store" });
  if (!response.ok) throw new Error(((await response.json().catch(() => null)) as { error?: string } | null)?.error ?? `Lỗi ${response.status}`);
  return response.json();
}

function Meter({ label, used, limit, format }: { label: string; used: number; limit: number; format: (n: number) => string }) {
  const percent = Math.min(100, used / limit * 100);
  return <div className="r2-op">
    <p><small>{label}</small> <strong>{format(used)}</strong> / {format(limit)} ({percent.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}%)</p>
    <div className={`r2-meter${percent >= 90 ? " danger" : percent >= 70 ? " warn" : ""}`}><span style={{ width: `${percent}%` }} /></div>
  </div>;
}
const count = (n: number) => n.toLocaleString("vi-VN");

export function R2Usage({ photos }: { photos: LibraryPhoto[] }) {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const apply = useCallback((request: Promise<Report>) => request
    .then(value => { setReport(value); setError(""); })
    .catch(e => setError(e instanceof Error ? e.message : "Không đọc được dung lượng R2."))
    .finally(() => setLoading(false)), []);
  const [ops, setOps] = useState<Operations | null>(null);
  const [opsError, setOpsError] = useState("");
  const loadOps = useCallback(() => fetchOperations()
    .then(value => { setOps(value); setOpsError(""); })
    .catch(e => setOpsError(e instanceof Error ? e.message : "Không đọc được số thao tác R2.")), []);
  const load = () => { setLoading(true); void apply(fetchReport()); void loadOps(); };
  useEffect(() => { void apply(fetchReport()); void loadOps(); }, [apply, loadOps]);

  const live = photos.filter(p => !p.demo && p.status !== "deleted");
  const originalBytes = live.reduce((sum, p) => sum + (p.size ?? 0), 0);
  const sized = live.filter(p => p.size);
  const used = report?.totalBytes ?? originalBytes;
  const percent = Math.min(100, used / FREE_BYTES * 100);
  // Average bucket cost per photo (original + thumbnail + preview) predicts headroom.
  const perPhoto = report && live.length ? report.totalBytes / live.length : sized.length ? originalBytes / sized.length : 0;
  const remaining = Math.max(0, FREE_BYTES - used);
  return <section className="admin-panel">
    <div className="admin-toolbar"><h2>Dung lượng Cloudflare R2</h2><button disabled={loading} onClick={load}>{loading ? "Đang đo…" : "Làm mới"}</button></div>
    <p><strong>{formatBytes(used)}</strong> / {formatBytes(FREE_BYTES)} miễn phí ({percent.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%){!report && " · ước tính từ ảnh gốc"}</p>
    <div className={`r2-meter${percent >= 90 ? " danger" : percent >= 70 ? " warn" : ""}`}><span style={{ width: `${percent}%` }} /></div>
    <div className="r2-grid">
      <div><small>Ảnh gốc ({live.length} ảnh)</small><strong>{formatBytes(originalBytes)}</strong></div>
      {report && <div><small>Thumbnail + preview ({report.variants.count} file)</small><strong>{formatBytes(report.variants.bytes)}</strong></div>}
      {report && <div><small>Chờ dọn (ảnh đã xóa)</small><strong>{formatBytes(report.awaitingCleanup.bytes)}</strong></div>}
      {report && <div><small>File mồ côi ({report.orphans.count})</small><strong>{formatBytes(report.orphans.bytes)}</strong></div>}
      <div><small>Còn trống miễn phí</small><strong>{formatBytes(remaining)}</strong></div>
      {perPhoto > 0 && <div><small>Có thể thêm khoảng</small><strong>{Math.floor(remaining / perPhoto).toLocaleString("vi-VN")} ảnh</strong></div>}
    </div>
    {report && <p className="admin-muted">Tổng {report.objects.toLocaleString("vi-VN")} file trên bucket{report.truncated ? " (danh sách bị cắt bớt)" : ""}. Trung bình mỗi ảnh chiếm {formatBytes(perPhoto)} gồm cả bản gốc và bản xem trước.{report.missing.count ? ` Có ${report.missing.count} ảnh mất file gốc.` : ""}</p>}
    {error && <p className="admin-muted">Không đọc được bucket R2: {error}. Đang hiển thị ước tính từ dữ liệu ảnh gốc.</p>}
    <h3>Thao tác trong tháng{ops && ` (từ ${new Date(ops.since).toLocaleDateString("vi-VN")})`}</h3>
    {ops ? <>
      <Meter label="Class A (tải lên, liệt kê)" used={ops.classA} limit={FREE_CLASS_A} format={count} />
      <Meter label="Class B (xem, tải về, HEAD)" used={ops.classB} limit={FREE_CLASS_B} format={count} />
      {ops.free > 0 && <p className="admin-muted">Thao tác miễn phí (xóa…): {count(ops.free)}. Số liệu Cloudflare có thể trễ vài phút.</p>}
    </> : <p className="admin-muted">{opsError ? `Không đọc được số thao tác: ${opsError}` : "Đang tải số thao tác…"}</p>}
    <p className="admin-muted">Gói miễn phí R2 mỗi tháng: 10 GB lưu trữ, 1 triệu thao tác Class A, 10 triệu thao tác Class B; băng thông ra miễn phí.</p>
  </section>;
}
