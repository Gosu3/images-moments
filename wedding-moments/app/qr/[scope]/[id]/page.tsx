import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { resolvePublicAppUrl } from "@/lib/app-url";

export default async function QrPage({ params }: { params: Promise<{ scope: string; id: string }> }) {
  const { scope, id } = await params;
  const isAlbum = scope === "album";
  const path = isAlbum ? `/album/${encodeURIComponent(id)}` : "/";
  const value = `${resolvePublicAppUrl()}${path}`;
  const qrUrl = `/api/qr?value=${encodeURIComponent(value)}`;
  return <main className="qr-page">
    <Link href={path} className="round-control" aria-label="Quay lại thư viện"><ArrowLeft /></Link>
    <section>
      <p className="eyebrow ink">Văn Thọ &amp; Hồng Thắm · Chia sẻ</p>
      <h1>Mang khoảnh khắc<br /><em>đến gần mọi người.</em></h1>
      <div className="qr-card"><img src={qrUrl} alt="Mã QR mở thư viện ảnh cưới Văn Thọ và Hồng Thắm" /><p>VĂN THỌ &amp; HỒNG THẮM</p><small>Quét để mở {isAlbum ? "album" : "thư viện"}</small></div>
      <a className="qr-download" href={qrUrl} download="wedding-moments-qr.svg"><Download />Tải mã QR</a>
    </section>
  </main>;
}
