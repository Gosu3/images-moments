export function readFavorites(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const value: unknown = JSON.parse(localStorage.getItem("wm-favorites") || "[]");
    return new Set(Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : []);
  } catch { return new Set(); }
}
export function writeFavorites(ids: Set<string>) {
  localStorage.setItem("wm-favorites", JSON.stringify([...ids]));
  window.dispatchEvent(new Event("wm-favorites-changed"));
}
