"use client";
import { useCallback, useEffect, useState } from "react";
import { demoLibrary, type Library } from "./library-model";
export function useLibrary() {
  const [data, setData] = useState<Library>(demoLibrary);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const reload = useCallback(async () => {
    try {
      const response = await fetch("/api/library", { cache: "no-store" });
      const result = await response.json() as Library & { error?: string };
      if (!response.ok) throw new Error(result.error);
      setData(result); setError(""); setReady(true);
    } catch (e) { setError((e as Error).message); setReady(false); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  async function mutate(operation: Record<string, unknown>) {
    const response = await fetch("/api/library", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...operation, revision: data.revision }) });
    const result = await response.json() as Library & { error?: string };
    if (!response.ok) throw new Error(result.error);
    setData(result);
  }
  return { data, error, ready, reload, mutate };
}
