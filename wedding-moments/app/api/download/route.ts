export async function GET() {
  return Response.json({ error: "Mở album, chọn ảnh và bấm Tải ZIP để tải file trực tiếp trên trình duyệt." }, { status: 410 });
}
