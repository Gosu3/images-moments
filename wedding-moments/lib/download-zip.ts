import type { Photo } from "./mock-data";
import { getOriginalDownloadEndpoint } from "./photo-urls";
import { fetchOriginal } from "./fetch-original";

export async function downloadZip(photos: Photo[], progress: (done: number, total: number) => void) {
  if (!photos.length || photos.length > 100) throw new Error("Chọn từ 1 đến 100 ảnh mỗi gói ZIP.");
  const { zip } = await import("fflate");
  const files: Record<string, Uint8Array> = {};
  let bytes = 0;
  for (const [index, photo] of photos.entries()) {
    const response = await fetch(getOriginalDownloadEndpoint(photo.id), { method: "POST" });
    const ticket = await response.json() as { url?: string; filename?: string; error?: string };
    if (!response.ok || !ticket.url) throw new Error(ticket.error || "Không thể lấy ảnh gốc.");
    const original = await fetchOriginal(ticket.url, photo.id);
    if (!original.ok || !original.body) throw new Error("Không thể tải ảnh gốc.");
    const reader = original.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const result = await reader.read(); if (result.done) break;
      bytes += result.value.length; length += result.value.length;
      if (bytes > 200 * 1024 * 1024) { await reader.cancel(); throw new Error("Gói ZIP vượt 200 MB. Hãy chọn ít ảnh hơn mỗi lần để tránh đầy bộ nhớ."); }
      chunks.push(result.value);
    }
    const data = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length; }
    const name = (ticket.filename || `${photo.id}.jpg`).replace(/[\\/\u0000-\u001f\u007f]/g, "-");
    files[`${String(index + 1).padStart(3, "0")}-${name}`] = data;
    progress(index + 1, photos.length);
  }
  const result = await new Promise<Uint8Array>((resolve, reject) => zip(files, { level: 0 }, (error, data) => error ? reject(error) : resolve(data)));
  const url = URL.createObjectURL(new Blob([new Uint8Array(result)], { type: "application/zip" }));
  const link = document.createElement("a"); link.href = url; link.download = "wedding-moments.zip";
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
