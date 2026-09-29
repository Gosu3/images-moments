// R2 PUT CORS and GET CORS are separate. Keep downloads usable if a bucket
// only allows direct uploads; the same-origin route streams without buffering.
export async function fetchOriginal(url: string, photoId: string) {
  try {
    const response = await fetch(url);
    if (response.ok) return response;
    await response.body?.cancel();
  } catch { /* Network/CORS fallback. */ }
  const response = await fetch(`/api/photos/${encodeURIComponent(photoId)}/download`);
  if (!response.ok) throw new Error("Không thể tải ảnh gốc. Vui lòng thử lại.");
  return response;
}
