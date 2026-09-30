"use client";
import { useState, useSyncExternalStore } from "react";
import { Download, X } from "lucide-react";
import { clearReadyDownload, downloadReadyDownload, getReadyDownload, shareReadyDownload, subscribeReadyDownload } from "@/lib/save-photo";

export function ReadyDownload({ inViewer = false }: { inViewer?: boolean }) {
  const file = useSyncExternalStore(subscribeReadyDownload, getReadyDownload, () => null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!file) return null;
  return <div className={`ready-download ${inViewer ? "in-viewer" : "outside-viewer"}`} role="status">
    <span title={file.name}>{error || `${file.name} · Sẵn sàng lưu`}</span>
    <button type="button" disabled={busy} onClick={async () => {
      setBusy(true); setError("");
      try { await shareReadyDownload(); } catch (cause) {
        if ((cause as Error).name !== "AbortError") setError("Không mở được menu lưu. Chọn Tải file.");
      } finally { setBusy(false); }
    }}><Download size={14} />Lưu ảnh</button>
    <button type="button" disabled={busy} onClick={() => { try { downloadReadyDownload(); } catch (cause) { setError((cause as Error).message); } }}>Tải file</button>
    <button type="button" aria-label="Bỏ ảnh đã chuẩn bị" onClick={clearReadyDownload}><X size={14} /></button>
  </div>;
}
