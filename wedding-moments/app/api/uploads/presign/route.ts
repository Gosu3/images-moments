import { libraryError, libraryOwner } from "@/lib/library-server";
// The old scaffold issued write URLs without authorization or finalization.
// Disable it until a durable upload-session/finalize flow is implemented.
export async function POST(request: Request) {
  try {
    await libraryOwner(request, true);
    return Response.json({ error: "Dùng mục Tải lên trong quản trị để lưu ảnh gốc.", code: "USE_LIBRARY_UPLOAD" }, { status: 410 });
  } catch (error) { return libraryError(error); }
}
