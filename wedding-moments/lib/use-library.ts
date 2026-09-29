"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { demoLibrary, type Library } from "./library-model";
export function useLibrary(admin = false) {
  const [data, setData] = useState<Library>(demoLibrary);
  const [error, setError] = useState("");
  const [authRequired, setAuthRequired] = useState(false);
  const [ready, setReady] = useState(false);
  const inFlight = useRef(false);
  const etag = useRef("");
  const reload = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const response = await fetch(admin ? "/api/library" : "/api/gallery", {
        cache: "no-store", signal: AbortSignal.timeout(15000),
        headers: !admin && etag.current ? { "If-None-Match": etag.current } : {},
      });
      if (response.status === 304) { setError(""); setReady(true); return; }
      const result = await response.json() as Library & { error?: string };
      if (!response.ok) {
        setAuthRequired(response.status === 401);
        if (response.status === 401) setReady(false);
        throw new Error(result.error || "Không thể tải thư viện.");
      }
      etag.current = response.headers.get("etag") || "";
      setData(previous => result.revision < previous.revision ? previous : { ...result, photos: result.photos.filter(p => p.status !== "deleted") }); setError(""); setAuthRequired(false); setReady(true);
    } catch (e) { setError((e as Error).message); }
    finally { inFlight.current = false; }
  }, [admin]);
  // reload synchronizes an external HTTP resource; its state updates occur
  // after await, not synchronously during the effect.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
    const refresh = () => { if (document.visibilityState === "visible") void reload(); };
    const timer = setInterval(refresh, admin ? 5000 : 3000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { clearInterval(timer); window.removeEventListener("focus", refresh); window.removeEventListener("online", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [reload, admin]);
  async function mutate(operation: Record<string, unknown>) {
    const response = await fetch("/api/library", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...operation, revision: data.revision }) });
    const result = await response.json() as Library & { error?: string };
    if (!response.ok) throw new Error(result.error);
    setData(previous => result.revision < previous.revision ? previous : { ...result, photos: result.photos.filter(p => p.status !== "deleted") });
  }
  return { data, error, authRequired, ready, reload, mutate };
}
