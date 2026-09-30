import Link from "next/link";
import { Heart } from "lucide-react";
import { HomeAlbumTabs } from "@/components/home-album-tabs";

export default function Home() {
  return (
    <main className="home-dashboard">
      <header className="home-nav">
        <Link href="/" className="home-brand" aria-label="Thư viện ảnh - Trang chủ"><span>MA</span><strong>Minh Anh &amp; Hoàng Nam</strong></Link>
        <nav aria-label="Điều hướng chính">
          <Link className="favorites-nav-tab" href="/favorites"><Heart size={16}/><span>Yêu thích</span></Link>
          <Link className="admin-nav-tab" href="/admin">Quản trị</Link>
        </nav>
      </header>
      <HomeAlbumTabs />
    </main>
  );
}
