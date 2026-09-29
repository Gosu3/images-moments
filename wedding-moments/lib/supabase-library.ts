import { setting } from "./cloud-config";
import type { Library } from "./library-model";

async function rest(path: string, init: RequestInit = {}) {
  const base = setting("SUPABASE_URL");
  const key = setting("SUPABASE_SECRET_KEY") || setting("SUPABASE_SERVICE_ROLE_KEY");
  if (!base || !key) throw new Error("Supabase configuration missing");
  const url = new URL(base);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/") throw new Error("Invalid Supabase URL");
  const headers = new Headers(init.headers);
  headers.set("apikey", key);
  // Legacy service-role JWTs need Authorization; modern sb_secret keys use apikey.
  if (!key.startsWith("sb_secret_")) headers.set("Authorization", `Bearer ${key}`);
  headers.set("Content-Type", "application/json");
  const response = await fetch(`${url.origin}/rest/v1/${path}`, { ...init, headers, cache: "no-store", signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Supabase request failed (${response.status})`);
  return response;
}
export async function readSupabaseLibrary(owner: string): Promise<Library | null> {
  const query = new URLSearchParams({ select: "data,revision", owner: `eq.${owner}`, limit: "1" });
  const rows = await (await rest(`wm_libraries?${query}`)).json() as { data: Library; revision: number }[];
  return rows[0] ? { ...rows[0].data, revision: rows[0].revision } : null;
}
export async function saveSupabaseLibrary(owner: string, data: Library, revision: number): Promise<boolean> {
  const response = await rest("rpc/wm_save_library", { method: "POST", body: JSON.stringify({ p_owner: owner, p_data: data, p_revision: revision }) });
  return await response.json() === true;
}
