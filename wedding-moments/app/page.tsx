import Link from "next/link";
import { CalendarDays, Heart, Images, LockKeyhole } from "lucide-react";
import { HomeAlbumTabs } from "@/components/home-album-tabs";
import { photos } from "@/lib/mock-data";

export default function Home() {
  return (
    <main className="home-dashboard">
      <header className="home-nav">
        <Link href="/" className="home-brand" aria-label="Wedding Moments - Trang chủ"><span>WM</span><strong>Wedding Moments</strong></Link>
        <nav aria-label="Điều hướng chính">
          <Link href="#our-story">Câu chuyện</Link>
          <Link href="#albums">Album ảnh</Link>
          <Link href="/favorites"><Heart size={17}/>Yêu thích</Link>
          <Link className="admin-nav-tab" href="/admin">Quản trị</Link>
        </nav>
      </header>

      <section className="compact-wedding-intro">
        <div className="compact-wedding-copy">
          <p className="eyebrow ink">Wedding Moments · 18.10.2026</p>
          <h1>Minh Anh <i>&amp;</i> Hoàng Nam</h1>
          <p className="compact-note">Những khoảnh khắc thân thương trong ngày chúng mình về chung một nhà.</p>
          <div className="compact-meta">
            <span><CalendarDays size={17}/>Hà Nội, Việt Nam</span>
            <span><Images size={17}/>{photos.length * 28 + 13} khoảnh khắc</span>
            <span><LockKeyhole size={16}/>Thư viện riêng tư</span>
          </div>
        </div>
        <figure className="compact-cover"><img src="/wedding-hero.webp" alt="Minh Anh và Hoàng Nam trong ánh hoàng hôn" fetchPriority="high"/></figure>
      </section>

      <section id="our-story" className="story-compact">
        <p className="eyebrow ink">Our Story · Câu chuyện của chúng mình</p>
        <div><h2>Từng khoảnh khắc,<br/><em>một phần ký ức.</em></h2><p>Từ buổi chiều dịu nắng đến lời hẹn ước trước gia đình — tất cả được lưu lại như cách chúng mình đã cảm nhận.</p></div>
      </section>

      <HomeAlbumTabs />

      <footer><span>WEDDING MOMENTS</span><p>Made for memories, kept with care.</p><Link href="/admin">Quản trị thư viện</Link></footer>
    </main>
  );
}
