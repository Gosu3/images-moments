import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { demoLibrary, type Library } from "./library-model";
import { libraryProvider } from "./cloud-config";
import { readSupabaseLibrary, saveSupabaseLibrary } from "./supabase-library";

// Transient optimistic-lock exhaustion; safe for clients to retry idempotent calls.
export const LIBRARY_BUSY_CODE = "LIBRARY_BUSY";
export class LibraryError extends Error {
  constructor(message: string, public status = 503, public code?: string) { super(message); }
}
export async function libraryOwner(request: Request, write = false) {
  if (write && request.headers.get("origin") !== new URL(request.url).origin) throw new LibraryError("Yêu cầu không hợp lệ.", 403);
  const user = await getChatGPTUser();
  if (!user) throw new LibraryError("Vui lòng đăng nhập để quản lý thư viện.", 401);
  return user.userId;
}
// This Vercel deployment hosts one wedding library. Never accept an owner
// supplied by a visitor; management endpoints still use libraryOwner.
export async function libraryReader(request: Request) {
  return process.env.VERCEL ? "vercel-admin" : libraryOwner(request);
}
let sharedRead: { expires: number; value: Promise<Library> } | undefined;
export async function readSharedLibrary(request: Request) {
  const owner = await libraryReader(request);
  if (!process.env.VERCEL) return readLibrary(owner);
  if (!sharedRead || sharedRead.expires <= Date.now()) {
    const entry = { expires: Date.now() + 2000, value: readLibrary(owner) };
    sharedRead = entry;
    void entry.value.catch(() => { if (sharedRead === entry) sharedRead = undefined; });
  }
  return sharedRead.value;
}
function db() {
  if (!env.DB) throw new LibraryError("Kho dữ liệu chưa sẵn sàng. Vui lòng thử lại sau.");
  return env.DB;
}
export function bucket() {
  if (!env.BUCKET) throw new LibraryError("Kho lưu ảnh chưa sẵn sàng.");
  return env.BUCKET;
}
export async function readLibrary(owner: string): Promise<Library> {
  if (libraryProvider() === "supabase") {
    const library = await readSupabaseLibrary(owner) ?? demoLibrary();
    return { ...library, photos: library.photos.filter(photo => !photo.demo) };
  }
  const row = await db().prepare("SELECT data, revision FROM libraries WHERE owner = ?").bind(owner).first<{ data: string; revision: number }>();
  const library: Library = row ? { ...JSON.parse(row.data), revision: row.revision } : demoLibrary();
  return { ...library, photos: library.photos.filter(photo => !photo.demo) };
}
export async function mutateLibrary(owner: string, update: (library: Library) => void, expected?: number) {
  const provider = libraryProvider();
  if (provider === "d1") await db().prepare("INSERT OR IGNORE INTO libraries (owner, data, revision) VALUES (?, ?, 0)").bind(owner, JSON.stringify(demoLibrary())).run();
  for (let attempt = 0; attempt < 12; attempt++) {
    // Concurrent uploads use optimistic revisions. Jitter avoids repeatedly
    // colliding with the same writer, without relaxing conflict detection.
    if (attempt) await new Promise(resolve => setTimeout(resolve, 40 * 2 ** Math.min(attempt, 4) + Math.random() * 200));
    const library = await readLibrary(owner);
    if (expected !== undefined && expected !== library.revision) throw new LibraryError("Dữ liệu vừa thay đổi. Hãy tải lại danh sách rồi thử lại.", 409);
    update(library);
    if (provider === "supabase") {
      if (await saveSupabaseLibrary(owner, library, library.revision)) { sharedRead = undefined; return { ...library, revision: library.revision + 1 }; }
      continue;
    }
    const result = await db().prepare("UPDATE libraries SET data = ?, revision = revision + 1 WHERE owner = ? AND revision = ?").bind(JSON.stringify(library), owner, library.revision).run();
    if (result.meta.changes) return { ...library, revision: library.revision + 1 };
  }
  throw new LibraryError("Thư viện đang được cập nhật. Vui lòng thử lại.", 409, LIBRARY_BUSY_CODE);
}
export function libraryError(error: unknown) {
  if (error instanceof LibraryError) return Response.json({ error: error.message, ...(error.code ? { code: error.code } : {}) }, { status: error.status });
  console.error("Library request failed", error);
  if (error instanceof Error && (error.message.includes("Supabase") || error.message.includes("Kho thư viện"))) {
    return Response.json({ error: error.message }, { status: 503 });
  }
  return Response.json({ error: "Không thể lưu hoặc tải thư viện. Vui lòng thử lại." }, { status: 503 });
}
