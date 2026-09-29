"use client";
import { useCallback, useEffect, useState } from "react";
import { demoLibrary, type Library } from "./library-model";
export function useLibrary() {
  const [data, setData] = useState<Library>(demoLibrary);
  const [error, setError] = useState("");
  const [authRequired, setAuthRequired] = useState(false);
  const [ready, setReady] = useState(false);
  const reload = useCallback(async () => {
    try {
      const response = await fetch("/api/library", { cache: "no-store" });
      const result = await response.json() as Library & { error?: string };
      if (!response.ok) {
        setAuthRequired(response.status === 401);
        throw new Error(result.error || "Không thể tải thư viện.");
      }
      setData({ ...result, photos: result.photos.filter(p => p.status !== "deleted") }); setError(""); setAuthRequired(false); setReady(true);
    } catch (e) { setError((e as Error).message); setReady(false); }
  }, []);
  // reload synchronizes an external HTTP resource; its state updates occur
  // after await, not synchronously during the effect.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void reload(); }, [reload]);
  async function mutate(operation: Record<string, unknown>) {
    const response = await fetch("/api/library", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...operation, revision: data.revision }) });
    const result = await response.json() as Library & { error?: string };
    if (!response.ok) throw new Error(result.error);
    setData({ ...result, photos: result.photos.filter(p => p.status !== "deleted") });
  }
  return { data, error, authRequired, ready, reload, mutate };
}
